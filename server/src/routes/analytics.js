const express = require('express');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const getDatasetRows = async (datasetId, limit = 5000) => {
  const data = await pool.query(`SELECT * FROM data_${datasetId} LIMIT $1`, [limit]);
  return data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
};

router.post('/:datasetId/regression', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const response = await axios.post(`${PYTHON_SERVICE}/analytics/regression`, { data: rows, ...req.body }, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/clustering', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const response = await axios.post(`${PYTHON_SERVICE}/analytics/clustering`, { data: rows, ...req.body }, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/classification', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const response = await axios.post(`${PYTHON_SERVICE}/analytics/classification`, { data: rows, ...req.body }, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/forecast', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const response = await axios.post(`${PYTHON_SERVICE}/analytics/forecast`, { data: rows, ...req.body }, { timeout: 60000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.get('/:datasetId/outliers', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const response = await axios.post(`${PYTHON_SERVICE}/analytics/outliers`, { data: rows, ...req.query }, { timeout: 15000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
