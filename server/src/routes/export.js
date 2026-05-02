const express = require('express');
const XLSX = require('xlsx');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/dataset/:datasetId/excel', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const data = await pool.query(`SELECT * FROM data_${req.params.datasetId}`);
    const rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${ds.rows[0].name}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dataset/:datasetId/csv', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const data = await pool.query(`SELECT * FROM data_${req.params.datasetId}`);
    const rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    if (!rows.length) return res.status(400).json({ error: 'No data' });
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g,'""')}"`).join(','))];
    res.setHeader('Content-Disposition', `attachment; filename="${ds.rows[0].name}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csvLines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/query/excel', authenticate, async (req, res) => {
  try {
    const { rows, filename = 'query_results' } = req.body;
    if (!rows || !rows.length) return res.status(400).json({ error: 'No data to export' });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
