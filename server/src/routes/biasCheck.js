const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { pyPost } = require('../utils/pythonClient');

const router = express.Router();

router.post('/:datasetId/run', authenticate, async (req, res) => {
  try {
    const { target_col, protected_col, feature_cols, task_type = 'classification' } = req.body;
    if (!target_col) return res.status(400).json({ error: 'target_col required' });
    if (!protected_col) return res.status(400).json({ error: 'protected_col required' });

    const [dataResult, metaResult] = await Promise.all([
      pool.query(`SELECT * FROM data_${req.params.datasetId} LIMIT 5000`),
      pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]),
    ]);

    const rows = dataResult.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    if (rows.length < 20) return res.status(400).json({ error: 'Need at least 20 rows for bias analysis' });

    const pyRes = await pyPost('/bias-check', { rows, target_col, protected_col, feature_cols, task_type }, { timeout: 120000 });
    res.json({ ...pyRes.data, dataset: metaResult.rows[0]?.name });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
