const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Hard limits ────────────────────────────────────────────────────────────
const MAX_ROW_FIELDS = 3;
const MAX_COL_FIELDS = 2;
const MAX_CELLS      = 2000;   // rowKeys × colKeys
const MAX_COL_KEYS   = 50;     // distinct values in col dimension
const MAX_ROW_KEYS   = 200;    // distinct values in row dimension
const STMT_TIMEOUT   = 25000;  // 25 s PostgreSQL statement timeout

// ── Format a composite key from multiple field values ─────────────────────
const compositeKey = (fields) =>
  fields.length === 1
    ? `COALESCE("${fields[0]}"::text,'(null)')`
    : `CONCAT_WS(' | ', ${fields.map(f => `COALESCE("${f}"::text,'(null)')`).join(', ')})`;

// ── Validate column names against schema (SQL injection guard) ────────────
const validateCols = (cols, schema) => {
  const valid = Array.isArray(schema)
    ? schema.map(c => c.name)
    : Object.keys(schema || {});
  const bad = cols.filter(c => !valid.includes(c));
  if (bad.length) throw new Error(`Invalid columns: ${bad.join(', ')}`);
};

const SAFE_AGG = {
  sum: 'SUM', avg: 'AVG', count: 'COUNT', min: 'MIN', max: 'MAX',
  count_distinct: 'COUNT DISTINCT',
  median: 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ',
  stddev: 'STDDEV',
};

const buildAggExpr = (func, field) => {
  if (func === 'count') return 'COUNT(*)';
  if (func === 'count_distinct') return `COUNT(DISTINCT "${field}"::text)`;
  if (func === 'median') return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "${field}"::numeric)`;
  const fn = SAFE_AGG[func] || 'SUM';
  return `${fn}("${field}"::numeric)`;
};

// ── Core pivot computation using SQL GROUP BY (scalable) ─────────────────
const runCompute = async (datasetId, body, res) => {
  let client;
  try {
    const {
      row_fields = [], col_fields = [],
      value_field, values: vf2,
      rowFields: rf2, colFields: cf2,    // accept both naming conventions
      aggregator = 'sum', filters = {},
    } = body;

    // Accept snake_case or camelCase field names
    const rowF  = (row_fields.length ? row_fields : (rf2 || [])).slice(0, MAX_ROW_FIELDS);
    const colF  = (col_fields.length ? col_fields : (cf2 || [])).slice(0, MAX_COL_FIELDS);
    const valF  = value_field || vf2;

    if (!valF) return res.status(400).json({ error: 'value_field required' });
    if (!rowF.length) return res.status(400).json({ error: 'At least one row field required' });

    // Validate column names against schema
    const dsResult = await pool.query('SELECT schema, row_count FROM datasets WHERE id=$1', [datasetId]);
    if (!dsResult.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const schema = dsResult.rows[0].schema;
    const rowCount = dsResult.rows[0].row_count || 0;

    const allCols = [...new Set([...rowF, ...colF, valF])];
    validateCols(allCols, schema);

    // ── Cardinality pre-check ───────────────────────────────────────────
    client = await pool.connect();
    await client.query(`SET statement_timeout = ${STMT_TIMEOUT}`);

    // Count distinct row combos
    const rowDistinctSQL = `SELECT COUNT(DISTINCT ${compositeKey(rowF)}) AS n FROM "data_${datasetId}"`;
    const rowDistinct = await client.query(rowDistinctSQL);
    const nRowKeys = parseInt(rowDistinct.rows[0].n);

    let nColKeys = 1;
    if (colF.length) {
      const colDistinctSQL = `SELECT COUNT(DISTINCT ${compositeKey(colF)}) AS n FROM "data_${datasetId}"`;
      const colDistinct = await client.query(colDistinctSQL);
      nColKeys = parseInt(colDistinct.rows[0].n);
    }

    if (nRowKeys > MAX_ROW_KEYS) {
      return res.status(400).json({
        error: `Too many row groups: ${nRowKeys.toLocaleString()} distinct combinations (max ${MAX_ROW_KEYS}). ` +
               `Use fewer row fields or add filters to narrow the data.`,
        rowKeys: nRowKeys, colKeys: nColKeys,
      });
    }
    if (nColKeys > MAX_COL_KEYS) {
      return res.status(400).json({
        error: `Too many column groups: ${nColKeys.toLocaleString()} distinct combinations (max ${MAX_COL_KEYS}). ` +
               `Use fewer column fields or switch column fields to a lower-cardinality column.`,
        rowKeys: nRowKeys, colKeys: nColKeys,
      });
    }
    const estimatedCells = nRowKeys * nColKeys;
    if (estimatedCells > MAX_CELLS) {
      return res.status(400).json({
        error: `Estimated pivot size too large: ${nRowKeys} rows × ${nColKeys} cols = ${estimatedCells.toLocaleString()} cells (max ${MAX_CELLS.toLocaleString()}). ` +
               `Reduce row or column fields, or apply filters.`,
        rowKeys: nRowKeys, colKeys: nColKeys,
      });
    }

    // ── Build WHERE clause from filters ────────────────────────────────
    const filterEntries = Object.entries(filters).filter(([, v]) => v !== '' && v !== null);
    const whereParts = filterEntries.map(([col], i) => `"${col}"::text = $${i + 1}`);
    const filterParams = filterEntries.map(([, v]) => v);
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    // ── SQL GROUP BY pivot ─────────────────────────────────────────────
    const rowKeyExpr = compositeKey(rowF);
    const aggExpr    = buildAggExpr(aggregator, valF);

    let matrix = {};
    let rowKeys, colKeys;
    let rowTotals = {}, colTotals = {};

    if (colF.length === 0) {
      // Simple aggregation: no col dimension
      const sql = `
        SELECT ${rowKeyExpr} AS row_key,
               ${aggExpr} AS val
        FROM "data_${datasetId}"
        ${whereClause}
        GROUP BY row_key
        ORDER BY row_key
        LIMIT ${MAX_ROW_KEYS}
      `;
      const r = await client.query(sql, filterParams);
      rowKeys = r.rows.map(row => row.row_key);
      colKeys = ['Total'];
      for (const row of r.rows) {
        const rk = row.row_key;
        const v  = row.val !== null ? parseFloat(parseFloat(row.val).toFixed(4)) : null;
        matrix[rk] = { Total: v };
        rowTotals[rk] = v || 0;
        colTotals['Total'] = (colTotals['Total'] || 0) + (v || 0);
      }
    } else {
      // Two-dimensional: fetch all (rowKey, colKey, value) triples
      const colKeyExpr = compositeKey(colF);
      const sql = `
        SELECT ${rowKeyExpr} AS row_key,
               ${colKeyExpr} AS col_key,
               ${aggExpr}    AS val
        FROM "data_${datasetId}"
        ${whereClause}
        GROUP BY row_key, col_key
        ORDER BY row_key, col_key
      `;
      const r = await client.query(sql, filterParams);

      rowKeys = [...new Set(r.rows.map(row => row.row_key))];
      colKeys = [...new Set(r.rows.map(row => row.col_key))];

      // Initialize matrix
      for (const rk of rowKeys) {
        matrix[rk] = {};
        for (const ck of colKeys) matrix[rk][ck] = null;
      }

      // Fill
      for (const row of r.rows) {
        const rk = row.row_key;
        const ck = row.col_key;
        const v  = row.val !== null ? parseFloat(parseFloat(row.val).toFixed(4)) : null;
        matrix[rk][ck] = v;
        rowTotals[rk]  = (rowTotals[rk] || 0) + (v || 0);
        colTotals[ck]  = (colTotals[ck] || 0) + (v || 0);
      }
    }

    // Round totals
    for (const k of Object.keys(rowTotals)) rowTotals[k] = parseFloat(rowTotals[k].toFixed(4));
    for (const k of Object.keys(colTotals)) colTotals[k] = parseFloat(colTotals[k].toFixed(4));
    const grandTotal = parseFloat(Object.values(rowTotals).reduce((a, b) => a + b, 0).toFixed(4));

    res.json({
      rowKeys, colKeys, matrix, rowTotals, colTotals, grandTotal,
      aggregator, valueField: valF,
      rowCount, nRowKeys, nColKeys, cells: nRowKeys * nColKeys,
    });
  } catch (err) {
    if (err.message?.includes('statement timeout') || err.code === '57014') {
      return res.status(408).json({ error: 'Query timed out (25 s). Too many rows or field combinations — apply filters or reduce fields.' });
    }
    // PostgreSQL "relation does not exist" — data table not yet seeded
    if (err.code === '42P01' || err.message?.includes('does not exist')) {
      return res.status(404).json({ error: `Data table for this dataset has not been seeded yet. Run the server seed script to populate it, or choose a different dataset.` });
    }
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
};

router.post('/compute', authenticate, async (req, res) => {
  const dsId = req.body.datasetId || req.body.dataset_id;
  if (!dsId) return res.status(400).json({ error: 'datasetId required in body' });
  return runCompute(dsId, req.body, res);
});

router.post('/:datasetId/compute', authenticate, async (req, res) => {
  return runCompute(req.params.datasetId, req.body, res);
});

router.post('/save', authenticate, async (req, res) => {
  try {
    const { name, dataset_id, rows_fields, cols_fields, value_field, aggregator } = req.body;
    const r = await pool.query(
      'INSERT INTO pivot_configs (name, dataset_id, rows_fields, cols_fields, value_field, aggregator, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, dataset_id, JSON.stringify(rows_fields), JSON.stringify(cols_fields), value_field, aggregator, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/configs', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT pc.*, d.name as dataset_name FROM pivot_configs pc LEFT JOIN datasets d ON pc.dataset_id=d.id ORDER BY pc.created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/saved', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT pc.*, d.name as dataset_name FROM pivot_configs pc LEFT JOIN datasets d ON pc.dataset_id=d.id ORDER BY pc.created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
