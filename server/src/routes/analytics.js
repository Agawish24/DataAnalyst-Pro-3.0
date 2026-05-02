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
    const { dateCol, valueCol, date_col, value_col, ...rest } = req.body;
    const payload = {
      data: rows,
      date_column: dateCol || date_col || req.body.date_column,
      value_column: valueCol || value_col || req.body.value_column,
      ...rest,
    };
    const response = await axios.post(`${PYTHON_SERVICE}/analytics/forecast`, payload, { timeout: 60000 });
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

router.post('/:datasetId/prescriptive', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId, 3000);
    const response = await axios.post(`${PYTHON_SERVICE}/prescriptive`, { rows, ...req.body }, { timeout: 60000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/prophet', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId, 5000);
    const { dateCol, valueCol, ...rest } = req.body;
    const payload = {
      rows,
      date_col: dateCol || req.body.date_col,
      value_col: valueCol || req.body.value_col,
      ...rest,
    };
    const response = await axios.post(`${PYTHON_SERVICE}/prophet-forecast`, payload, { timeout: 120000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/root-cause', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId, 5000);
    const response = await axios.post(`${PYTHON_SERVICE}/root-cause`, { rows, ...req.body }, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
