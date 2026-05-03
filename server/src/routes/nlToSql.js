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

// ── Fuzzy column match: tries exact → partial → prefix → first-token match
const fuzzyMatchCol = (term, colList) => {
  if (!term || !colList.length) return null;
  const t = term.toLowerCase().replace(/_/g, ' ').trim();
  if (!t) return null;

  // Exact
  let m = colList.find(c => c.toLowerCase().replace(/_/g, ' ') === t);
  if (m) return { col: m, fuzzy: false };

  // Col name contained in term
  m = colList.find(c => t.includes(c.toLowerCase().replace(/_/g, ' ')));
  if (m) return { col: m, fuzzy: true };

  // Term contained in col name
  m = colList.find(c => c.toLowerCase().replace(/_/g, ' ').includes(t));
  if (m) return { col: m, fuzzy: true };

  // Prefix match (≥3 chars)
  if (t.length >= 3) {
    const prefix = t.substring(0, Math.min(t.length, 5));
    m = colList.find(c => c.toLowerCase().startsWith(prefix));
    if (m) return { col: m, fuzzy: true };
  }

  // First word of term matches any word in col name
  const firstWord = t.split(' ')[0];
  if (firstWord.length >= 3) {
    m = colList.find(c => c.toLowerCase().split('_').includes(firstWord));
    if (m) return { col: m, fuzzy: true };
  }

  return null;
};

// ── Parse "by X and Y" → array of matched columns
const parseGroupByTerms = (afterByText, catCols, dateCols, allCols) => {
  // split on "and", "," or "+"
  const rawTerms = afterByText.split(/\s+and\s+|,\s*|\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const term of rawTerms) {
    const m = fuzzyMatchCol(term, catCols) || fuzzyMatchCol(term, dateCols) || fuzzyMatchCol(term, allCols);
    if (m) results.push({ ...m, term });
  }
  return results;
};

const parseNL = async (text, datasetId) => {
  const t = tokenize(text);
  const words = t.split(' ');

  if (!datasetId) {
    return { sql: `SELECT *\nFROM dataset\nLIMIT 100`, confidence: 0.3, detected: {}, schemaWarnings: ['No dataset selected — using generic placeholder table name'] };
  }

  const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]).catch(() => ({ rows: [] }));
  if (!ds.rows[0]) {
    return { sql: `SELECT *\nFROM dataset\nLIMIT 100`, confidence: 0.3, detected: {}, schemaWarnings: ['Dataset not found'] };
  }

  const raw = ds.rows[0].schema || [];
  const schemaArr = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([name, type]) => ({ name, type: String(type) }));

  const tableName = `data_${datasetId}`;
  const allCols = schemaArr.map(s => s.name);
  const numericCols = schemaArr.filter(s => ['integer','numeric','float','double','decimal','number','bigint'].some(k => String(s.type).toLowerCase().includes(k))).map(s => s.name);
  const catCols = schemaArr.filter(s => ['text','varchar','char','string','character'].some(k => String(s.type).toLowerCase().includes(k))).map(s => s.name);
  const dateCols = schemaArr.filter(s => ['date','time','timestamp'].some(k => String(s.type).toLowerCase().includes(k))).map(s => s.name);

  const schemaWarnings = [];
  let confidenceBonus = 0;

  // ── Detect aggregate function
  let aggFunc = null;
  for (const [word, fn] of Object.entries(AGGREGATES)) {
    if (t.includes(word)) { aggFunc = fn; break; }
  }

  // ── Detect numeric column being aggregated
  const mentionedNumeric = numericCols.filter(c => t.includes(c.toLowerCase().replace(/_/g, ' ')) || t.includes(c.toLowerCase()));
  const mentionedCols = allCols.filter(c => t.includes(c.toLowerCase().replace(/_/g, ' ')) || t.includes(c.toLowerCase()));
  let aggCol = mentionedNumeric[0] || numericCols[0] || null;
  if (mentionedNumeric.length) confidenceBonus += 0.15;

  // ── Detect GROUP BY — find "by X" or "per X" or "grouped by X"
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
  if (groupRaw) {
    groupMatches = parseGroupByTerms(groupRaw, catCols, dateCols, allCols);
    if (groupMatches.length) {
      groupMatches.forEach(gm => {
        if (gm.fuzzy) {
          schemaWarnings.push(`"${gm.term}" not found in schema — using closest match "${gm.col}" for GROUP BY`);
          confidenceBonus += 0.08;
        } else {
          confidenceBonus += 0.15;
        }
      });
    } else {
      // No column found for the group term
      schemaWarnings.push(`No column matching "${groupRaw}" found in schema (${allCols.slice(0,6).join(', ')}${allCols.length > 6 ? '…' : ''}). GROUP BY omitted.`);
    }
  }

  // Fallback: if groupCol mentioned among catCols
  if (!groupMatches.length) {
    const directCatMatch = catCols.find(c => mentionedCols.includes(c));
    if (directCatMatch) groupMatches = [{ col: directCatMatch, fuzzy: false, term: directCatMatch }];
  }

  // ── Time grouping (monthly, weekly, etc.)
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

  // ── Filter / WHERE detection
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

  // ── LIMIT detection
  let limit = null;
  const limitMatch = t.match(/top\s+(\d+)|first\s+(\d+)|(\d+)\s+(?:rows?|records?|results?)/);
  if (limitMatch) { limit = parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3]); confidenceBonus += 0.05; }

  // ── Sort direction
  let orderDir = 'DESC';
  for (const [word, dir] of Object.entries(SORT_WORDS)) {
    if (t.includes(word)) { orderDir = dir; break; }
  }

  // ── Build SQL
  const whereClause = filterClauses.length ? `WHERE ${filterClauses.join(' AND ')}` : '';
  const limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 100';
  const groupCols = groupMatches.map(gm => gm.col);

  let sql = '';
  let queryType = 'select';

  if (/show|list|display|get\s+all|fetch|select/.test(t) && !aggFunc && !groupCols.length) {
    // Simple SELECT
    const colList = mentionedCols.length ? mentionedCols.map(c => `"${c}"`).join(', ') : '*';
    sql = `SELECT ${colList}\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\n${limitClause}`;
    queryType = 'select';
  } else if (aggFunc && groupCols.length) {
    // Aggregation WITH GROUP BY
    const aggExpr = aggFunc === 'COUNT' ? 'COUNT(*)' : `${aggFunc}("${aggCol}")`;
    const aggAlias = `${aggFunc.toLowerCase()}_${aggCol || 'count'}`;
    if (groupCols.length === 1) {
      const gc = groupCols[0];
      const groupExpr = timeUnit ? `DATE_TRUNC('${timeUnit}', "${gc}")` : `"${gc}"`;
      const groupAlias = timeUnit || gc;
      sql = `SELECT ${groupExpr} AS ${groupAlias},\n  ${aggExpr} AS ${aggAlias}\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\nGROUP BY ${groupExpr}\nORDER BY ${aggExpr} ${orderDir}\n${limitClause}`;
    } else {
      // Multi-column GROUP BY
      const groupExprs = groupCols.map(gc => `"${gc}"`).join(', ');
      const selectGroupCols = groupCols.map(gc => `"${gc}"`).join(',\n  ');
      sql = `SELECT ${selectGroupCols},\n  ${aggExpr} AS ${aggAlias}\nFROM ${tableName}${whereClause ? '\n' + whereClause : ''}\nGROUP BY ${groupExprs}\nORDER BY ${aggExpr} ${orderDir}\n${limitClause}`;
    }
    queryType = 'aggregation';
    confidenceBonus += 0.1;
  } else if (aggFunc && aggCol) {
    // Aggregation WITHOUT GROUP BY (scalar)
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

  // ── Confidence: base depends on schema richness + how many pieces resolved
  const schemaBonus = Math.min(0.1, allCols.length * 0.01);
  const baseConf = 0.45;
  const confidence = Math.min(0.97, baseConf + schemaBonus + confidenceBonus);

  return {
    sql: sql.trim().replace(/\n{2,}/g, '\n'),
    confidence: +confidence.toFixed(2),
    detected: { aggFunc, aggCol, groupCols, filterClauses, limit, timeUnit, mentionedCols, queryType },
    schemaWarnings,
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
    res.json({ input: inputText, sql: result.sql, confidence: result.confidence, detected: result.detected, schemaWarnings: result.schemaWarnings, schema: result.schema });
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
