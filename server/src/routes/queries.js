const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Execute SQL against a dataset table
router.post('/execute', authenticate, async (req, res) => {
  try {
    const { sql, datasetId } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL is required' });

    // Security: only allow SELECT statements
    const clean = sql.trim().toUpperCase();
    if (!clean.startsWith('SELECT') && !clean.startsWith('WITH')) {
      return res.status(400).json({ error: 'Only SELECT queries are allowed' });
    }

    // Replace dataset table alias: users can write "FROM dataset" and we map it to the actual table
    let resolvedSQL = sql;
    if (datasetId) {
      resolvedSQL = sql.replace(/\bfrom\s+dataset\b/gi, `FROM data_${datasetId}`)
                       .replace(/\bjoin\s+dataset\b/gi, `JOIN data_${datasetId}`);
    }

    const start = Date.now();
    const result = await pool.query(resolvedSQL);
    const executionTime = Date.now() - start;

    await pool.query(
      'INSERT INTO queries (dataset_id, user_id, sql_text, result, execution_time_ms, status) VALUES ($1,$2,$3,$4,$5,$6)',
      [datasetId || null, req.user.id, sql, JSON.stringify({ rows: result.rows.slice(0, 1000), rowCount: result.rowCount }), executionTime, 'success']
    );

    res.json({ rows: result.rows, rowCount: result.rowCount, executionTime, columns: result.fields?.map(f => f.name) || [] });
  } catch (err) {
    if (req.body.datasetId) {
      await pool.query(
        'INSERT INTO queries (dataset_id, user_id, sql_text, status, error_message) VALUES ($1,$2,$3,$4,$5)',
        [req.body.datasetId, req.user.id, req.body.sql, 'error', err.message]
      ).catch(() => {});
    }
    res.status(400).json({ error: err.message });
  }
});

// Get query history
router.get('/history', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.*, d.name as dataset_name FROM queries q LEFT JOIN datasets d ON q.dataset_id=d.id
       WHERE q.user_id=$1 ORDER BY q.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available tables for a dataset
router.get('/tables/:datasetId', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    const cols = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 AND column_name != 'row_index' ORDER BY ordinal_position`,
      [`data_${req.params.datasetId}`]
    );
    res.json({ tableName: `data_${req.params.datasetId}`, alias: 'dataset', columns: cols.rows, dataset: ds.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
