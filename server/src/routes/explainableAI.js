const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { pyPost } = require('../utils/pythonClient');

const router = express.Router();

router.post('/:datasetId/explain', authenticate, async (req, res) => {
  try {
    const { target_col, feature_cols, task_type = 'auto' } = req.body;
    if (!target_col) return res.status(400).json({ error: 'target_col required' });

    const [dataResult, metaResult] = await Promise.all([
      pool.query(`SELECT * FROM data_${req.params.datasetId} LIMIT 3000`),
      pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]),
    ]);

    const rows = dataResult.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    if (!rows.length) return res.status(400).json({ error: 'Dataset has no data' });

    const pyRes = await pyPost('/explain', { rows, target_col, feature_cols, task_type }, { timeout: 120000 });
    res.json({ ...pyRes.data, dataset: metaResult.rows[0]?.name });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
