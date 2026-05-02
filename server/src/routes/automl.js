const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();
const PYTHON = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const getDatasetRows = async (datasetId, limit = 5000) => {
  const r = await pool.query(`SELECT * FROM data_${datasetId} LIMIT $1`, [limit]);
  return r.rows.map(row => { const { row_index, ...rest } = row; return rest; });
};

router.post('/:datasetId/run', authenticate, async (req, res) => {
  try {
    const { target_col, feature_cols, task_type } = req.body;
    if (!target_col) return res.status(400).json({ error: 'target_col required' });
    const rows = await getDatasetRows(req.params.datasetId, 3000);

    // Detect task type if not specified
    let detectedTask = task_type;
    if (!detectedTask) {
      const sample = rows.slice(0, 50).map(r => r[target_col]).filter(v => v !== null);
      const unique = new Set(sample).size;
      const isNumeric = sample.every(v => !isNaN(parseFloat(v)));
      detectedTask = (!isNumeric || unique <= 10) ? 'classification' : 'regression';
    }

    // Run multiple models via Python
    const response = await axios.post(`${PYTHON}/automl`, {
      data: rows, target_col, feature_cols, task_type: detectedTask
    }, { timeout: 120000 });

    // Save run
    const saved = await pool.query(
      'INSERT INTO automl_runs (dataset_id, target_col, feature_cols, task_type, best_model, best_score, all_scores, hyperparams, status, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [req.params.datasetId, target_col, JSON.stringify(feature_cols || []), detectedTask, response.data.best_model, response.data.best_score, JSON.stringify(response.data.all_scores || {}), JSON.stringify(response.data.best_params || {}), 'completed', req.user.id]
    );

    res.json({ ...response.data, runId: saved.rows[0].id });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.get('/runs', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT ar.*, d.name as dataset_name FROM automl_runs ar LEFT JOIN datasets d ON ar.dataset_id=d.id WHERE ar.user_id=$1 ORDER BY ar.created_at DESC LIMIT 20', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/runs/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM automl_runs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
