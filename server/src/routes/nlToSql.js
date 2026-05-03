const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const AGGREGATES = {
  total: 'SUM', sum: 'SUM', revenue: 'SUM', sales: 'SUM',
  average: 'AVG', avg: 'AVG', mean: 'AVG',
  count: 'COUNT', how_many: 'COUNT', number_of: 'COUNT',
  maximum: 'MAX', max: 'MAX', highest: 'MAX', largest: 'MAX', biggest: 'MAX', most: 'MAX',
  minimum: 'MIN', min: 'MIN', lowest: 'MIN', smallest: 'MIN', least: 'MIN',
};
const COMPARISON = {
  more: '>', greater: '>', above: '>', over: '>', exceeds: '>',
  less: '<', below: '<', under: '<',
  equals: '=', equal: '=', 'not equal': '!=',
  between: 'BETWEEN',
};
const TIME_UNITS = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year', annual: 'year' };
const SORT_WORDS = { top: 'DESC', best: 'DESC', highest: 'DESC', most: 'DESC', largest: 'DESC', biggest: 'DESC', worst: 'ASC', lowest: 'ASC', smallest: 'ASC', least: 'ASC' };

const tokenize = (text) => text.toLowerCase().replace(/[?!]/g, '').replace(/\s+/g, ' ').trim();

// ── Fuzzy column match: exact → partial → prefix → first-token
const fuzzyMatchCol = (term, colList) => {
  if (!term || !colList.length) return null;
  const t = term.toLowerCase().replace(/_/g, ' ').trim();
  if (!t) return null;
  let m = colList.find(c => c.toLowerCase().replace(/_/g, ' ') === t);
  if (m) return { col: m, fuzzy: false };
  m = colList.find(c => t.includes(c.toLowerCase().replace(/_/g, ' ')));
  if (m) return { col: m, fuzzy: true };
  m = colList.find(c => c.toLowerCase().replace(/_/g, ' ').includes(t));
  if (m) return { col: m, fuzzy: true };
  if (t.length >= 3) {
    const prefix = t.substring(0, Math.min(t.length, 5));
    m = colList.find(c => c.toLowerCase().startsWith(prefix));
    if (m) return { col: m, fuzzy: true };
  }
  const firstWord = t.split(' ')[0];
  if (firstWord.length >= 3) {
    m = colList.find(c => c.toLowerCase().split('_').includes(firstWord));
    if (m) return { col: m, fuzzy: true };
  }
  return null;
};

// ── Parse "by X and Y" → array of matched columns
const parseGroupByTerms = (afterByText, catCols, dateCols, allCols) => {
  const rawTerms = afterByText.split(/\s+and\s+|,\s*|\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const term of rawTerms) {
    const m = fuzzyMatchCol(term, catCols) || fuzzyMatchCol(term, dateCols) || fuzzyMatchCol(term, allCols);
    if (m) results.push({ ...m, term });
  }
  return results;
};

// ── Detect words in query that look like column names but aren't in schema
// Returns { missing: [{term, suggestedDataset}], foundInOtherDatasets: [{term, datasets:[]}] }
const detectMissingColumns = async (queryTerms, allCols, currentDatasetId) => {
  // Words that are likely column references (≥4 chars, not common English)
  const stopWords = new Set(['show','list','count','find','what','where','which','average','total','maximum','minimum','number','records','results','grouped','broken','segmented','highest','lowest','between','greater','equals','monthly','weekly','yearly','quarterly','annual','daily','display','fetch','select','from','with','that','have','their','also','than','most','many','some','each','more','less','data','rows','table','columns','distinct','unique','order','limit','group','having','false','true','null','left','right','join','inner','outer','union','all']);
  
  const suspicious = queryTerms.filter(w =>
    w.length >= 4 &&
    !stopWords.has(w) &&
    !allCols.some(c => c.toLowerCase().replace(/_/g,' ').includes(w) || w.includes(c.toLowerCase().replace(/_/g,' '))) &&
    /^[a-z_]+$/.test(w)
  );

  if (!suspicious.length) return { missing: [], suggestions: [] };

  // Search other datasets for these terms
  const allDs = await pool.query('SELECT id, name, schema FROM datasets WHERE id != $1 LIMIT 20', [currentDatasetId]).catch(() => ({ rows: [] }));
  const suggestions = [];
  for (const term of suspicious) {
    const matchingDs = [];
    for (const ds of allDs.rows) {
      const schema = Array.isArray(ds.schema) ? ds.schema : Object.entries(ds.schema || {}).map(([name]) => ({ name }));
      const found = schema.find(c => {
        const cn = c.name.toLowerCase().replace(/_/g, ' ');
        return cn.includes(term) || term.includes(cn) || cn.startsWith(term.substring(0, 4));
      });
      if (found) matchingDs.push({ id: ds.id, name: ds.name, column: found.name });
    }
    if (matchingDs.length) {
      suggestions.push({ term, foundIn: matchingDs });
    }
  }
  return { missing: suspicious, suggestions };
};

const parseNL = async (text, datasetId) => {
  const t = tokenize(text);
  const words = t.split(' ');

  if (!datasetId) {
    return { sql: `SELECT *\nFROM dataset\nLIMIT 100`, confidence: 0.3, detected: {}, schemaWarnings: ['No dataset selected'], datasetSuggestions: [] };
  }

  const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]).catch(() => ({ rows: [] }));
  if (!ds.rows[0]) {
    return { sql: `SELECT *\nFROM dataset\nLIMIT 100`, confidence: 0.3, detected: {}, schemaWarnings: ['Dataset not found'], datasetSuggestions: [] };
  }

  const raw = ds.rows[0].schema || [];
  const schemaArr = Array.isArray(raw) ? raw : Object.entries(raw).map(([name, type]) => ({ name, type: String(type) }));
  const tableName = `data_${datasetId}`;
  const allCols = schemaArr.map(s => s.name);
  const numericCols = schemaArr.filter(s => ['integer','numeric','float','double','decimal','number','bigint'].some(k => String(s.type).toLowerCase().includes(k))).map(s => s.name);
  const catCols = schemaArr.filter(s => ['text','varchar','char','string','character'].some(k => String(s.type).toLowerCase().includes(k))).map(s => s.name);
  const dateCols = schemaArr.filter(s => ['date','time','timestamp'].some(k => String(s.type).toLowerCase().includes(k))).map(s => s.name);

  const schemaWarnings = [];
  let confidenceBonus = 0;
  let confidencePenalty = 0;

  // ── 1. Distribution / "X vs Y" pattern detection
  // e.g. "count attrition yes vs no by department"
  // e.g. "attrition vs region" / "status yes vs no"
  let distributionCol = null;
  let isDistribution = false;
  const vsMatch = t.match(/\b(\w+)(?:\s+\w+)?\s+vs\.?\s+(?:\w+\s+)?by\b/i)
    || t.match(/\b(\w+)\s+yes\s+vs\.?\s+no\b/i)
    || t.match(/\b(\w+)\s+vs\.?\s+(\w+)\b/i);
  if (vsMatch || /\bvs\b/.test(t)) {
    isDistribution = true;
    // Try to find the distribution column — the word before "vs" (after aggregation verb)
    const vsIdx = words.indexOf('vs');
    if (vsIdx > 0) {
      // Walk backwards to find the column term (skip "yes", "no", value words)
      const valueWords = new Set(['yes','no','true','false','0','1','male','female','active','inactive']);
      for (let i = vsIdx - 1; i >= 0; i--) {
        if (!valueWords.has(words[i]) && words[i].length >= 3) {
          const m = fuzzyMatchCol(words[i], catCols) || fuzzyMatchCol(words[i], allCols);
          if (m) { distributionCol = m.col; break; }
          // Column not in schema — record as missing
          if (/^[a-z_]+$/.test(words[i]) && words[i].length >= 4) {
            schemaWarnings.push(`Column "${words[i]}" not found in "${ds.rows[0].name}" — it may be in a different dataset.`);
            confidencePenalty += 0.2;
          }
          break;
        }
      }
    }
  }

  // ── 2. Aggregate function
  let aggFunc = null;
  for (const [word, fn] of Object.entries(AGGREGATES)) {
    if (t.includes(word)) { aggFunc = fn; break; }
  }
  if (isDistribution && !aggFunc) aggFunc = 'COUNT';

  // ── 3. Mentioned columns
  const mentionedCols = allCols.filter(c => t.includes(c.toLowerCase().replace(/_/g, ' ')) || t.includes(c.toLowerCase()));
  const mentionedNumeric = numericCols.filter(c => mentionedCols.includes(c));
  let aggCol = mentionedNumeric[0] || (aggFunc === 'COUNT' ? null : numericCols[0]) || null;
  if (mentionedNumeric.length) confidenceBonus += 0.15;

  // ── 4. Cross-dataset missing column lookup
  const { missing, suggestions: datasetSuggestions } = await detectMissingColumns(words, allCols, datasetId);
  if (missing.length) {
    const alreadyWarned = missing.filter(w => !schemaWarnings.some(sw => sw.includes(w)));
    // Only warn about meaningful missing terms not already reported
    for (const term of alreadyWarned.slice(0, 3)) {
      const found = datasetSuggestions.find(s => s.term === term);
      if (found) {
        schemaWarnings.push(`"${term}" not in "${ds.rows[0].name}" — found in: ${found.foundIn.map(f => `${f.name} (column: ${f.column})`).join(', ')}`);
        confidencePenalty += 0.15;
      }
    }
  }

  // ── 5. GROUP BY detection
  let groupMatches = [];
  let groupRaw = null;
  const byPatterns = [
    /\bby\s+(.+?)(?:\s+where|\s+having|\s+order|\s+limit|\s+when|\s*$)/,
    /\bper\s+(.+?)(?:\s+where|\s+having|\s+order|\s+limit|\s*$)/,
    /\bgrouped by\s+(.+?)(?:\s+where|\s+having|\s+order|\s+limit|\s*$)/,
    /\bbroken down by\s+(.+?)(?:\s+where|\s+having|\s+order|\s+limit|\s*$)/,
    /\bsegmented by\s+(.+?)(?:\s+where|\s+having|\s+order|\s+limit|\s*$)/,
  ];
  for (const re of byPatterns) {
    const m = t.match(re);
    if (m) { groupRaw = m[1].trim(); break; }
  }

  // Strip "vs ..." from groupRaw if present so it doesn't pollute the group-by term
  if (groupRaw) groupRaw = groupRaw.replace(/\s*vs\.?\s+\w+/gi, '').trim();

  if (groupRaw) {
    groupMatches = parseGroupByTerms(groupRaw, catCols, dateCols, allCols);
    if (groupMatches.length) {
      groupMatches.forEach(gm => {
        if (gm.fuzzy) {
          schemaWarnings.push(`"${gm.term}" not found — using closest match "${gm.col}" for GROUP BY`);
          confidenceBonus += 0.08;
        } else {
          confidenceBonus += 0.15;
        }
      });
    } else {
      schemaWarnings.push(`No column matching "${groupRaw}" found in schema (${allCols.slice(0, 5).join(', ')}…). GROUP BY omitted.`);
      confidencePenalty += 0.1;
    }
  }

  // Fallback group-by from directly mentioned catCols
  if (!groupMatches.length) {
    const directCatMatch = catCols.find(c => mentionedCols.includes(c) && c !== distributionCol);
    if (directCatMatch) groupMatches = [{ col: directCatMatch, fuzzy: false, term: directCatMatch }];
  }

  // ── 6. Time grouping
  let timeUnit = null;
  for (const [word, unit] of Object.entries(TIME_UNITS)) {
    if (t.includes(word)) {
      timeUnit = unit;
      if (!groupMatches.length && dateCols.length) {
        groupMatches = [{ col: dateCols[0], fuzzy: false, term: dateCols[0] }];
        confidenceBonus += 0.1;
      }
      break;
    }
  }

  // ── 7. Filter / WHERE
  const filterClauses = [];
  for (const [word, op] of Object.entries(COMPARISON)) {
    const idx = t.indexOf(word);
    if (idx !== -1) {
      const numMatch = t.slice(idx).match(/[\d,.]+/);
      if (numMatch && aggCol) {
        filterClauses.push(`"${aggCol}" ${op} ${numMatch[0].replace(/,/g, '')}`);
        confidenceBonus += 0.05;
      }
    }
  }

  // ── 8. LIMIT
  let limit = null;
  const limitMatch = t.match(/top\s+(\d+)|first\s+(\d+)|(\d+)\s+(?:rows?|records?|results?)/);
  if (limitMatch) { limit = parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3]); confidenceBonus += 0.05; }

  // ── 9. Sort direction
  let orderDir = 'DESC';
  for (const [word, dir] of Object.entries(SORT_WORDS)) {
    if (t.includes(word)) { orderDir = dir; break; }
  }

  // ── 10. Build SQL
  const whereClause = filterClauses.length ? `WHERE ${filterClauses.join(' AND ')}` : '';
  const limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 100';
  const groupCols = groupMatches.map(gm => gm.col);

  let sql = '';
  let queryType = 'select';

  if (isDistribution && distributionCol) {
    // ── DISTRIBUTION: "X yes vs no by Y" → GROUP BY Y, X showing count per value
    const distExpr = `"${distributionCol}"`;
    const groupExprs = groupCols.length
      ? [...groupCols.map(g => `"${g}"`), distExpr].join(', ')
      : distExpr;
    const selectCols = groupCols.length
      ? [...groupCols.map(g => `"${g}"`), distExpr].join(',\n  ')
      : distExpr;
    sql = `SELECT ${selectCols},\n  COUNT(*) AS count\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\nGROUP BY ${groupExprs}\nORDER BY ${groupCols.length ? `"${groupCols[0]}"` : distExpr}, ${distExpr}\n${limitClause}`;
    queryType = 'distribution';
    confidenceBonus += 0.15;
  } else if (isDistribution && !distributionCol && groupCols.length) {
    // Fallback: "vs" detected but col not found — distribution over the group col only
    const gc = groupCols[0];
    sql = `SELECT "${gc}", COUNT(*) AS count\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\nGROUP BY "${gc}"\nORDER BY count DESC\n${limitClause}`;
    queryType = 'distribution';
    confidenceBonus += 0.05;
  } else if (/show|list|display|get\s+all|fetch|select/.test(t) && !aggFunc && !groupCols.length) {
    const colList = mentionedCols.length ? mentionedCols.map(c => `"${c}"`).join(', ') : '*';
    sql = `SELECT ${colList}\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\n${limitClause}`;
    queryType = 'select';
  } else if (aggFunc && groupCols.length) {
    const aggExpr = aggFunc === 'COUNT' ? 'COUNT(*)' : `${aggFunc}("${aggCol}")`;
    const aggAlias = `${aggFunc.toLowerCase()}_${aggCol || 'count'}`;
    if (groupCols.length === 1) {
      const gc = groupCols[0];
      const groupExpr = timeUnit ? `DATE_TRUNC('${timeUnit}', "${gc}")` : `"${gc}"`;
      const groupAlias = timeUnit || gc;
      sql = `SELECT ${groupExpr} AS ${groupAlias},\n  ${aggExpr} AS ${aggAlias}\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\nGROUP BY ${groupExpr}\nORDER BY ${aggExpr} ${orderDir}\n${limitClause}`;
    } else {
      const groupExprs = groupCols.map(g => `"${g}"`).join(', ');
      const selectGroupCols = groupCols.map(g => `"${g}"`).join(',\n  ');
      sql = `SELECT ${selectGroupCols},\n  ${aggExpr} AS ${aggAlias}\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\nGROUP BY ${groupExprs}\nORDER BY ${aggExpr} ${orderDir}\n${limitClause}`;
    }
    queryType = 'aggregation';
    confidenceBonus += 0.1;
  } else if (aggFunc && aggCol) {
    const aggExpr = aggFunc === 'COUNT' ? 'COUNT(*)' : `${aggFunc}("${aggCol}")`;
    sql = `SELECT ${aggExpr} AS result\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}`;
    queryType = 'scalar';
  } else if (filterClauses.length) {
    sql = `SELECT *\nFROM ${tableName}\nWHERE ${filterClauses.join(' AND ')}\n${limitClause}`;
    queryType = 'filter';
  } else if (/rank|top|best|worst|highest|lowest/.test(t) && aggCol) {
    sql = `SELECT *, ROW_NUMBER() OVER (ORDER BY "${aggCol}" ${orderDir}) AS rank\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\nORDER BY "${aggCol}" ${orderDir}\n${limitClause}`;
    queryType = 'ranking';
    confidenceBonus += 0.05;
  } else {
    const colList = mentionedCols.length ? mentionedCols.map(c => `"${c}"`).join(', ') : '*';
    sql = `SELECT ${colList}\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\n${limitClause}`;
    queryType = 'select';
  }

  const schemaBonus = Math.min(0.1, allCols.length * 0.01);
  const baseConf = 0.45;
  const confidence = Math.min(0.97, Math.max(0.25, baseConf + schemaBonus + confidenceBonus - confidencePenalty));

  return {
    sql: sql.trim().replace(/\n{2,}/g, '\n'),
    confidence: +confidence.toFixed(2),
    detected: { aggFunc, aggCol, groupCols, filterClauses, limit, timeUnit, mentionedCols, queryType, distributionCol },
    schemaWarnings,
    datasetSuggestions,
    schema: { columns: allCols, numeric: numericCols, categorical: catCols, date: dateCols },
  };
};

const handleConvert = async (req, res) => {
  try {
    const { text, question, dataset_id, datasetId } = req.body;
    const inputText = text || question;
    const dsId = dataset_id || datasetId;
    if (!inputText) return res.status(400).json({ error: 'text or question is required' });
    const result = await parseNL(inputText, dsId);
    await pool.query(
      'INSERT INTO nl_queries (natural_text, generated_sql, dataset_id, confidence, user_id) VALUES ($1,$2,$3,$4,$5)',
      [inputText, result.sql, dsId || null, result.confidence, req.user.id]
    ).catch(() => {});
    res.json({
      input: inputText,
      sql: result.sql,
      confidence: result.confidence,
      detected: result.detected,
      schemaWarnings: result.schemaWarnings,
      datasetSuggestions: result.datasetSuggestions,
      schema: result.schema,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

router.post('/', authenticate, handleConvert);
router.post('/query', authenticate, handleConvert);
router.post('/convert', authenticate, handleConvert);
router.post('/translate', authenticate, handleConvert);

router.get('/history', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM nl_queries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/examples', authenticate, (req, res) => {
  res.json([
    { text: 'Show me total revenue by region', category: 'Aggregation' },
    { text: 'What is the average salary by department', category: 'Aggregation' },
    { text: 'List top 10 products by profit', category: 'Ranking' },
    { text: 'Count employees by level', category: 'Count' },
    { text: 'Show monthly sales trend', category: 'Time-series' },
    { text: 'Find records where discount is greater than 0.2', category: 'Filter' },
    { text: 'What are the top 5 highest revenue regions', category: 'Ranking' },
    { text: 'Show me total profit by product and channel', category: 'Multi-group' },
    { text: 'Count attrition yes vs no by department', category: 'Distribution' },
    { text: 'Average close price by month', category: 'Time-series' },
  ]);
});

module.exports = router;
