const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const AGGREGATES = { total: 'SUM', sum: 'SUM', average: 'AVG', avg: 'AVG', mean: 'AVG', count: 'COUNT', maximum: 'MAX', max: 'MAX', minimum: 'MIN', min: 'MIN', median: 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY' };
const COMPARISON = { more: '>', greater: '>', above: '>', over: '>', less: '<', below: '<', under: '<', equals: '=', equal: '=', 'not equal': '!=', between: 'BETWEEN' };
const TIME_UNITS = { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year", annual: "year" };

const tokenize = (text) => text.toLowerCase().replace(/[?!]/g, '').replace(/\s+/g, ' ').trim();

const parseNL = async (text, datasetId) => {
  const t = tokenize(text);
  const words = t.split(' ');

  let schema = {};
  let tableName = 'dataset';
  if (datasetId) {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]).catch(() => ({ rows: [] }));
    if (ds.rows[0]) schema = ds.rows[0].schema || {};
    const cols = Object.keys(schema);
    const numericCols = cols.filter(c => ['integer','numeric','float','double','decimal','number'].some(t => String(schema[c]).toLowerCase().includes(t)));
    const catCols = cols.filter(c => ['text','varchar','char','string'].some(t => String(schema[c]).toLowerCase().includes(t)));
    const dateCols = cols.filter(c => ['date','time','timestamp'].some(t => String(schema[c]).toLowerCase().includes(t)));

    // Detect intent
    let aggFunc = null, aggCol = null, groupCol = null, filterClauses = [], orderDir = 'DESC', limit = null, timeUnit = null;

    // Detect aggregate function
    for (const [word, fn] of Object.entries(AGGREGATES)) {
      if (t.includes(word)) { aggFunc = fn; break; }
    }

    // Detect columns mentioned
    const mentionedCols = cols.filter(c => t.includes(c.toLowerCase().replace(/_/g, ' ')) || t.includes(c.toLowerCase()));
    aggCol = numericCols.find(c => mentionedCols.includes(c)) || numericCols[0];
    groupCol = catCols.find(c => mentionedCols.includes(c));

    // Group by keywords
    const byIdx = words.indexOf('by');
    if (byIdx !== -1 && byIdx < words.length - 1) {
      const afterBy = words.slice(byIdx + 1).join(' ');
      groupCol = catCols.find(c => afterBy.includes(c.toLowerCase().replace(/_/g, ' '))) || groupCol;
    }

    // Time grouping
    for (const [word, unit] of Object.entries(TIME_UNITS)) {
      if (t.includes(word)) { timeUnit = unit; groupCol = dateCols[0] || groupCol; break; }
    }

    // Filter detection
    for (const [word, op] of Object.entries(COMPARISON)) {
      const idx = t.indexOf(word);
      if (idx !== -1) {
        const numMatch = t.slice(idx).match(/[\d,.]+/);
        if (numMatch && aggCol) {
          filterClauses.push(`"${aggCol}" ${op} ${numMatch[0].replace(/,/g, '')}`);
        }
      }
    }

    // Limit detection
    const limitMatch = t.match(/top\s+(\d+)|first\s+(\d+)|(\d+)\s+(?:rows?|records?|results?)/);
    if (limitMatch) limit = parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3]);

    // Sort direction
    if (/lowest|ascending|asc|smallest/.test(t)) orderDir = 'ASC';

    // Build SQL
    let sql = '';
    const whereClause = filterClauses.length ? `WHERE ${filterClauses.join(' AND ')}` : '';
    const limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 100';

    // Pattern: "show me all ..."
    if (/show|list|display|get\s+all|fetch/.test(t) && !aggFunc && !groupCol) {
      const colList = mentionedCols.length ? mentionedCols.map(c => `"${c}"`).join(', ') : '*';
      sql = `SELECT ${colList}\nFROM ${tableName}\n${whereClause}\n${limitClause}`;
    }
    // Pattern: aggregation by group
    else if (aggFunc && groupCol) {
      const groupExpr = timeUnit ? `DATE_TRUNC('${timeUnit}', "${groupCol}")` : `"${groupCol}"`;
      const aggExpr = aggFunc === 'COUNT' ? 'COUNT(*)' : `${aggFunc}("${aggCol}")`;
      sql = `SELECT ${groupExpr} AS ${timeUnit || groupCol},\n  ${aggExpr} AS ${aggFunc.toLowerCase()}_${aggCol || 'count'}\nFROM ${tableName}\n${whereClause}\nGROUP BY ${groupExpr}\nORDER BY ${aggExpr} ${orderDir}\n${limitClause}`;
    }
    // Pattern: just aggregation (no group)
    else if (aggFunc && aggCol) {
      const aggExpr = aggFunc === 'COUNT' ? 'COUNT(*)' : `${aggFunc}("${aggCol}")`;
      sql = `SELECT ${aggExpr} AS result\nFROM ${tableName}\n${whereClause}`;
    }
    // Pattern: where/filter query
    else if (filterClauses.length) {
      sql = `SELECT *\nFROM ${tableName}\nWHERE ${filterClauses.join(' AND ')}\n${limitClause}`;
    }
    // Pattern: compare / rank
    else if (/rank|top|best|worst|highest|lowest/.test(t) && aggCol) {
      sql = `SELECT *, ROW_NUMBER() OVER (ORDER BY "${aggCol}" ${orderDir}) AS rank\nFROM ${tableName}\n${whereClause}\nORDER BY "${aggCol}" ${orderDir}\n${limitClause}`;
    }
    // Default: select with mentioned columns
    else {
      const colList = mentionedCols.length ? mentionedCols.map(c => `"${c}"`).join(', ') : '*';
      sql = `SELECT ${colList}\nFROM ${tableName}\n${whereClause}\n${limitClause}`;
    }

    const confidence = Math.min(0.95, 0.4 + (mentionedCols.length * 0.15) + (aggFunc ? 0.2 : 0) + (groupCol ? 0.1 : 0));
    return { sql: sql.trim().replace(/\n+/g, '\n'), confidence: +confidence.toFixed(2), detected: { aggFunc, aggCol, groupCol, filterClauses, limit, timeUnit, mentionedCols } };
  }
  return { sql: `SELECT *\nFROM dataset\nLIMIT 100`, confidence: 0.3, detected: {} };
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
    res.json({ input: inputText, sql: result.sql, confidence: result.confidence, detected: result.detected });
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
