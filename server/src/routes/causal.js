const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { pyPost } = require('../utils/pythonClient');

const router = express.Router();

router.post('/:datasetId/run', authenticate, async (req, res) => {
  try {
    const { treatment_col, outcome_col, control_cols } = req.body;
    if (!treatment_col) return res.status(400).json({ error: 'treatment_col required' });
    if (!outcome_col) return res.status(400).json({ error: 'outcome_col required' });

    const [dataResult, metaResult] = await Promise.all([
      pool.query(`SELECT * FROM data_${req.params.datasetId} LIMIT 5000`),
      pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]),
    ]);

    const rows = dataResult.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    if (rows.length < 20) return res.status(400).json({ error: 'Need at least 20 rows for causal inference' });

    const pyRes = await pyPost('/causal', { rows, treatment_col, outcome_col, control_cols }, { timeout: 120000 });
    res.json({ ...pyRes.data, dataset: metaResult.rows[0]?.name });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
