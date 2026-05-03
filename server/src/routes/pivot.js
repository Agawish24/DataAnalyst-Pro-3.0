const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const aggregate = (values, func) => {
  const nums = values.map(Number).filter(n => !isNaN(n));
  if (!nums.length) return null;
  switch (func) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': case 'mean': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'count': return values.length;
    case 'count_distinct': return new Set(values).size;
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    case 'median': { const s = [...nums].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
    case 'stddev': { const mean = nums.reduce((a,b)=>a+b,0)/nums.length; return Math.sqrt(nums.reduce((a,b)=>a+(b-mean)**2,0)/nums.length); }
    default: return nums.reduce((a, b) => a + b, 0);
  }
};

const runCompute = async (datasetId, body, res) => {
  try {
    const { row_fields = [], col_fields = [], value_field, values, aggregator = 'sum', filters = {} } = body;
    const vf = value_field || values;
    if (!vf) return res.status(400).json({ error: 'value_field required' });
    const value_field_resolved = vf;

    const data = await pool.query(`SELECT * FROM data_${datasetId} LIMIT 50000`);
    let rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });

    for (const [col, val] of Object.entries(filters)) {
      if (val !== '' && val !== null) rows = rows.filter(r => String(r[col]) === String(val));
    }

    const rowKeys = [...new Set(rows.map(r => row_fields.map(f => r[f]).join(' | ')))].sort();
    const colKeys = col_fields.length ? [...new Set(rows.map(r => col_fields.map(f => r[f]).join(' | ')))].sort() : ['Total'];

    const matrix = {};
    const rowTotals = {};
    const colTotals = {};

    for (const rk of rowKeys) {
      matrix[rk] = {};
      for (const ck of colKeys) {
        const matching = rows.filter(r => {
          const rMatch = row_fields.every((f, i) => String(r[f]) === rk.split(' | ')[i]);
          const cMatch = col_fields.length === 0 || col_fields.every((f, i) => String(r[f]) === ck.split(' | ')[i]);
          return rMatch && cMatch;
        });
        const val = aggregate(matching.map(r => r[value_field_resolved]), aggregator);
        matrix[rk][ck] = val !== null ? +val.toFixed(4) : null;
        rowTotals[rk] = (rowTotals[rk] || 0) + (val || 0);
        colTotals[ck] = (colTotals[ck] || 0) + (val || 0);
      }
    }

    const grandTotal = Object.values(rowTotals).reduce((a, b) => a + b, 0);
    res.json({ rowKeys, colKeys, matrix, rowTotals, colTotals, grandTotal: +grandTotal.toFixed(4), aggregator, valueField: value_field_resolved, rowCount: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    const r = await pool.query('INSERT INTO pivot_configs (name, dataset_id, rows_fields, cols_fields, value_field, aggregator, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, dataset_id, JSON.stringify(rows_fields), JSON.stringify(cols_fields), value_field, aggregator, req.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/configs', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT pc.*, d.name as dataset_name FROM pivot_configs pc LEFT JOIN datasets d ON pc.dataset_id=d.id WHERE pc.created_by=$1 ORDER BY pc.created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/saved', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT pc.*, d.name as dataset_name FROM pivot_configs pc LEFT JOIN datasets d ON pc.dataset_id=d.id WHERE pc.created_by=$1 ORDER BY pc.created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
