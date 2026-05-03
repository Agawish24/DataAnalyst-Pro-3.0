const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Allowed statement prefixes (read-only + session-config operations)
const ALLOWED_PREFIXES = [
  'SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'SET', 'BEGIN', 'COMMIT',
  'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'TABLE', 'VALUES', 'COPY (',
];

// Blocked statement prefixes (destructive DML/DDL)
const BLOCKED_PREFIXES = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE',
  'GRANT', 'REVOKE', 'COPY ', 'EXECUTE', 'CALL', 'DO', 'IMPORT',
  'LOAD', 'MERGE', 'REPLACE',
];

function stripComments(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

function isSafeSQL(sql) {
  const stripped = stripComments(sql).trim();
  if (!stripped) return { ok: true };

  // Split on semicolons and check each non-empty statement
  const statements = stripped.split(';').map(s => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    const upper = stmt.toUpperCase().replace(/\s+/g, ' ');

    // Check blocked first
    const blockedMatch = BLOCKED_PREFIXES.find(p => upper.startsWith(p));
    if (blockedMatch) {
      return {
        ok: false,
        error: `Statement type not allowed in the SQL Editor: ${blockedMatch.trim()}. Only read operations (SELECT, EXPLAIN, SHOW, SET, WITH) are permitted.`,
      };
    }

    // Check allowed
    const allowed = ALLOWED_PREFIXES.some(p => upper.startsWith(p));
    if (!allowed) {
      return {
        ok: false,
        error: `Unrecognised or unsupported statement. Only SELECT, WITH, EXPLAIN, SHOW, SET, BEGIN/COMMIT are allowed.`,
      };
    }
  }

  return { ok: true };
}

const executeSQL = async (req, res) => {
  try {
    const { sql, datasetId } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL is required' });

    const safety = isSafeSQL(sql);
    if (!safety.ok) {
      return res.status(400).json({ error: safety.error });
    }

    // Replace dataset table alias: users can write "FROM dataset" and we map it to the actual table
    let resolvedSQL = sql;
    if (datasetId) {
      resolvedSQL = sql
        .replace(/\bfrom\s+dataset\b/gi, `FROM data_${datasetId}`)
        .replace(/\bjoin\s+dataset\b/gi, `JOIN data_${datasetId}`);
    }

    const start = Date.now();
    const result = await pool.query(resolvedSQL);
    const executionTime = Date.now() - start;

    await pool.query(
      'INSERT INTO queries (dataset_id, user_id, sql_text, result, execution_time_ms, status) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        datasetId || null,
        req.user.id,
        sql,
        JSON.stringify({ rows: result.rows.slice(0, 1000), rowCount: result.rowCount }),
        executionTime,
        'success',
      ]
    );

    res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      executionTime,
      columns: result.fields?.map(f => f.name) || [],
      command: result.command || null,
    });
  } catch (err) {
    if (req.body.datasetId) {
      await pool.query(
        'INSERT INTO queries (dataset_id, user_id, sql_text, status, error_message) VALUES ($1,$2,$3,$4,$5)',
        [req.body.datasetId, req.user.id, req.body.sql, 'error', err.message]
      ).catch(() => {});
    }
    res.status(400).json({ error: err.message });
  }
};

router.post('/', authenticate, executeSQL);
router.post('/execute', authenticate, executeSQL);

// Get query history
router.get('/history', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.*, d.name as dataset_name FROM queries q
       LEFT JOIN datasets d ON q.dataset_id=d.id
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
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name=$1 AND column_name != 'row_index'
       ORDER BY ordinal_position`,
      [`data_${req.params.datasetId}`]
    );
    res.json({
      tableName: `data_${req.params.datasetId}`,
      alias: 'dataset',
      columns: cols.rows,
      dataset: ds.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
