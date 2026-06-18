const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { pyPost } = require('../utils/pythonClient');

const router = express.Router();

router.post('/:datasetId/run', authenticate, async (req, res) => {
  try {
    const { target_col, feature_cols, task_type = 'auto' } = req.body;
    if (!target_col) return res.status(400).json({ error: 'target_col required' });

    const [dataResult, metaResult] = await Promise.all([
      pool.query(`SELECT * FROM data_${req.params.datasetId} LIMIT 5000`),
      pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]),
    ]);

    const rows = dataResult.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    if (!rows.length) return res.status(400).json({ error: 'Dataset has no data' });

    const qt0 = Date.now();
    await pool.query(`SELECT COUNT(*) FROM data_${req.params.datasetId}`);
    const queryMs = Date.now() - qt0;

    const t0 = Date.now();
    const pyRes = await pyPost('/benchmark', { rows, target_col, feature_cols, task_type }, { timeout: 180000 });
    const totalMs = Date.now() - t0;

    await pool.query(
      `INSERT INTO benchmark_runs (user_id, dataset_id, target_col, task_type, results, total_ms)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, req.params.datasetId, target_col, task_type, JSON.stringify(pyRes.data), totalMs]
    ).catch(() => {});

    res.json({
      ...pyRes.data,
      dataset: metaResult.rows[0]?.name,
      total_benchmark_ms: totalMs,
      query_latency_ms: queryMs,
      n_rows: rows.length,
      run_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT br.*, d.name as dataset_name
       FROM benchmark_runs br LEFT JOIN datasets d ON br.dataset_id=d.id
       WHERE br.user_id=$1 ORDER BY br.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/system-stats', authenticate, async (req, res) => {
  try {
    const datasets = await pool.query(
      'SELECT id, name, row_count FROM datasets WHERE row_count IS NOT NULL ORDER BY row_count DESC LIMIT 8'
    );
    const stats = [];
    for (const ds of datasets.rows) {
      const t0 = Date.now();
      const cnt = await pool.query(`SELECT COUNT(*) FROM data_${ds.id}`).catch(() => ({ rows: [{ count: 0 }] }));
      stats.push({
        dataset_id: ds.id, name: ds.name,
        declared_rows: ds.row_count,
        actual_rows: parseInt(cnt.rows[0].count),
        query_ms: Date.now() - t0,
      });
    }
    res.json({ query_benchmarks: stats, timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
