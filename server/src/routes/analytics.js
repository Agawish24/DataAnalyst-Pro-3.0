const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { pyPost } = require('../utils/pythonClient');

const router = express.Router();

const getDatasetRows = async (datasetId, limit = 5000) => {
  const data = await pool.query(`SELECT * FROM data_${datasetId} LIMIT $1`, [limit]);
  return data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
};

router.post('/:datasetId/regression', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const { x_column, y_column, target_column, target_col, feature_columns, feature_cols, target, features, ...rest } = req.body;
    const payload = { data: rows, target: target || y_column || target_column || target_col, features: features || feature_columns || feature_cols || (x_column ? [x_column] : undefined), ...rest };
    const response = await pyPost('/analytics/regression', payload, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/clustering', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const response = await pyPost('/analytics/clustering', { data: rows, ...req.body }, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/classification', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const { target_column, feature_columns, target, features, ...rest } = req.body;
    const payload = { data: rows, target: target || target_column, features: features || feature_columns, ...rest };
    const response = await pyPost('/analytics/classification', payload, { timeout: 30000 });
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
    const payload = { data: rows, date_column: dateCol || date_col || req.body.date_column, value_column: valueCol || value_col || req.body.value_column, ...rest };
    const response = await pyPost('/analytics/forecast', payload, { timeout: 60000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.get('/:datasetId/outliers', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId);
    const response = await pyPost('/analytics/outliers', { data: rows, ...req.query }, { timeout: 15000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/prescriptive', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId, 3000);
    const { target_column, target_col, target, ...rest } = req.body;
    const payload = { rows, target_col: target_col || target_column || target, ...rest };
    const response = await pyPost('/prescriptive', payload, { timeout: 60000 });
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
    const payload = { rows, date_col: dateCol || req.body.date_col, value_col: valueCol || req.body.value_col, ...rest };
    const response = await pyPost('/prophet-forecast', payload, { timeout: 120000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/:datasetId/root-cause', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId, 5000);
    const { target_column, target_col, target, ...rest } = req.body;
    const payload = { rows, target_col: target_col || target_column || target, ...rest };
    const response = await pyPost('/root-cause', payload, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python analytics service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.get('/:datasetId/summary', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId, 5000);
    const { computeFullSummary } = require('../helpers/statsHelper');
    const { getDataQuality } = require('../helpers/dataClean');
    const summary = computeFullSummary(rows);
    const quality = getDataQuality(rows);
    res.json({ summary, quality, rowCount: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:datasetId/correlation', authenticate, async (req, res) => {
  try {
    const rows = await getDatasetRows(req.params.datasetId, 5000);
    const { computeCorrelationMatrix } = require('../helpers/statsHelper');
    const correlation = computeCorrelationMatrix(rows);
    res.json({ correlation, rowCount: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
