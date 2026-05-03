const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Simple NL → SQL rule-based engine (no external API needed)
const nlToSQL = (text, tableName, schema = []) => {
  const t = text.toLowerCase().trim();
  const cols = schema.map(c => c.name);
  const numericCols = schema.filter(c => c.type === 'numeric').map(c => c.name);

  // Determine requested columns
  let selectCols = '*';
  const colMentions = cols.filter(c => t.includes(c.toLowerCase()));

  // Aggregations
  if (t.match(/\b(count|how many|number of)\b/)) {
    if (colMentions.length) return `SELECT COUNT("${colMentions[0]}") as count FROM ${tableName}`;
    return `SELECT COUNT(*) as count FROM ${tableName}`;
  }
  if (t.match(/\baverage|mean|avg\b/) && numericCols.length) {
    const col = colMentions.find(c => numericCols.includes(c)) || numericCols[0];
    return `SELECT AVG("${col}"::numeric) as average FROM ${tableName}`;
  }
  if (t.match(/\bsum|total\b/) && numericCols.length) {
    const col = colMentions.find(c => numericCols.includes(c)) || numericCols[0];
    return `SELECT SUM("${col}"::numeric) as total FROM ${tableName}`;
  }
  if (t.match(/\bmax|maximum|highest|largest\b/) && numericCols.length) {
    const col = colMentions.find(c => numericCols.includes(c)) || numericCols[0];
    return `SELECT MAX("${col}"::numeric) as maximum FROM ${tableName}`;
  }
  if (t.match(/\bmin|minimum|lowest|smallest\b/) && numericCols.length) {
    const col = colMentions.find(c => numericCols.includes(c)) || numericCols[0];
    return `SELECT MIN("${col}"::numeric) as minimum FROM ${tableName}`;
  }

  // Group by
  const groupMatch = t.match(/\bby\s+(\w+)\b/);
  if (groupMatch) {
    const groupCol = cols.find(c => c.toLowerCase() === groupMatch[1]) || cols[0];
    if (groupCol) {
      const agg = numericCols.length ? `COUNT(*) as count, AVG("${numericCols[0]}"::numeric) as avg_${numericCols[0]}` : 'COUNT(*) as count';
      return `SELECT "${groupCol}", ${agg} FROM ${tableName} GROUP BY "${groupCol}" ORDER BY count DESC LIMIT 20`;
    }
  }

  // Sort/order
  const orderMatch = t.match(/\b(top|first)\s+(\d+)\b/);
  const limit = orderMatch ? parseInt(orderMatch[2]) : 10;

  if (t.match(/\bsort|order|rank\b/) && numericCols.length) {
    const col = colMentions.find(c => numericCols.includes(c)) || numericCols[0];
    const dir = t.match(/\basc|ascending|lowest\b/) ? 'ASC' : 'DESC';
    selectCols = colMentions.length ? colMentions.map(c=>`"${c}"`).join(', ') : '*';
    return `SELECT ${selectCols} FROM ${tableName} ORDER BY "${col}"::numeric ${dir} LIMIT ${limit}`;
  }

  if (colMentions.length) {
    selectCols = colMentions.map(c => `"${c}"`).join(', ');
  }
  return `SELECT ${selectCols} FROM ${tableName} LIMIT ${limit}`;
};

// Suggest chart type based on query result
const suggestChart = (rows, sql) => {
  if (!rows.length) return { type: 'table', config: {} };
  const cols = Object.keys(rows[0]);
  const sqlLower = sql.toLowerCase();
  if (sqlLower.includes('group by') || sqlLower.includes('count(') ) {
    return cols.length === 2 ? { type: 'bar', xKey: cols[0], yKey: cols[1] } : { type: 'bar', xKey: cols[0], yKey: cols[1] };
  }
  if (sqlLower.includes('avg(') || sqlLower.includes('sum(') || sqlLower.includes('max(') || sqlLower.includes('min(')) {
    return { type: 'bar', xKey: cols[0], yKey: cols[1] || cols[0] };
  }
  if (rows.length <= 10 && cols.length <= 3) return { type: 'pie', labelKey: cols[0], valueKey: cols[1] || cols[0] };
  return { type: 'table', config: {} };
};

const handleAIQuery = async (req, res) => {
  try {
    const { naturalLanguage, message, datasetId, dataset_id } = req.body;
    const nlText = naturalLanguage || message;
    const dsId = datasetId || dataset_id;
    req.body.naturalLanguage = nlText;
    req.body.datasetId = dsId;
    return handleAIQueryCore(req, res);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const handleAIQueryCore = async (req, res) => {
  try {
    const { naturalLanguage, datasetId } = req.body;
    if (!naturalLanguage) return res.status(400).json({ error: 'Natural language query required' });
    if (!datasetId) return res.status(400).json({ error: 'Dataset ID required' });

    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const dataset = ds.rows[0];
    const tableName = `data_${datasetId}`;
    const schema = dataset.schema || [];

    const generatedSQL = nlToSQL(naturalLanguage, tableName, schema);

    // Execute generated SQL
    const result = await pool.query(generatedSQL);
    const visualization = suggestChart(result.rows, generatedSQL);

    await pool.query(
      'INSERT INTO ai_conversations (user_id, dataset_id, natural_language, generated_sql, result, visualization_config) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, datasetId, naturalLanguage, generatedSQL, JSON.stringify(result.rows.slice(0, 100)), JSON.stringify(visualization)]
    );

    res.json({
      naturalLanguage,
      generatedSQL,
      rows: result.rows,
      rowCount: result.rowCount,
      visualization,
      dataset: { name: dataset.name, schema }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.post('/chat', authenticate, handleAIQuery);
router.post('/query', authenticate, handleAIQueryCore);

router.get('/history', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, d.name as dataset_name FROM ai_conversations a LEFT JOIN datasets d ON a.dataset_id=d.id
       WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get suggestions for a dataset
router.get('/suggestions/:datasetId', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    const schema = ds.rows[0].schema || [];
    const numCols = schema.filter(c => c.type === 'numeric').map(c => c.name);
    const catCols = schema.filter(c => c.type !== 'numeric').map(c => c.name);
    const suggestions = [
      `Show me the top 10 rows`,
      `How many rows are in this dataset?`,
      ...(numCols.length ? [`What is the average ${numCols[0]}?`, `Show the maximum and minimum ${numCols[0]}`] : []),
      ...(catCols.length ? [`Group by ${catCols[0]} and count`, `Show distribution of ${catCols[0]}`] : []),
      ...(numCols.length > 1 ? [`Sort by ${numCols[0]} descending`] : []),
    ];
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
