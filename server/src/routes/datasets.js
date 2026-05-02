const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { getDataQuality } = require('../helpers/dataClean');
const { computeFullSummary, computeCorrelationMatrix } = require('../helpers/statsHelper');

const router = express.Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const parseCSV = (filePath) => new Promise((resolve, reject) => {
  const rows = [];
  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', row => rows.push(row))
    .on('end', () => resolve(rows))
    .on('error', reject);
});

const parseExcel = (filePath) => {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws);
};

// Upload dataset
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { originalname, path: filePath, size } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    let rows = [];
    if (ext === '.csv') rows = await parseCSV(filePath);
    else if (ext === '.xlsx' || ext === '.xls') rows = parseExcel(filePath);
    else if (ext === '.json') rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Unsupported file type. Use CSV, Excel, or JSON.' });
    }

    if (!rows.length) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'File is empty' });
    }

    const schema = Object.keys(rows[0]).map(col => {
      const vals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
      const nums = vals.map(Number).filter(n => !isNaN(n));
      return { name: col, type: nums.length > vals.length * 0.8 ? 'numeric' : 'text', sample: vals.slice(0, 3) };
    });

    const datasetName = req.body.name || path.basename(originalname, ext);
    const result = await pool.query(
      `INSERT INTO datasets (name, source, original_filename, schema, row_count, column_count, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [datasetName, ext.replace('.', '').toUpperCase(), originalname, JSON.stringify(schema), rows.length, Object.keys(rows[0]).length, size, req.user.id]
    );

    const dataset = result.rows[0];
    // Store data in a JSONB column (create data table per dataset)
    const tableName = `data_${dataset.id}`;
    const cols = Object.keys(rows[0]);
    const colDefs = cols.map(c => `"${c.replace(/"/g,'')}" TEXT`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tableName} (row_index SERIAL, ${colDefs})`);
    // Insert in batches
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const vals = batch.map((row, bi) => `(${cols.map((c, ci) => `$${bi * cols.length + ci + 1}`).join(',')})`).join(',');
      const params = batch.flatMap(row => cols.map(c => String(row[c] ?? '')));
      await pool.query(`INSERT INTO ${tableName} (${cols.map(c=>`"${c.replace(/"/g,'')}"`).join(',')}) VALUES ${vals}`, params);
    }

    fs.unlinkSync(filePath);
    res.status(201).json({ ...dataset, schema, preview: rows.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List datasets
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name as uploader_name FROM datasets d LEFT JOIN users u ON d.uploaded_by = u.id ORDER BY d.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get dataset details + preview
router.get('/:id', authenticate, async (req, res) => {
  try {
    const dataset = await pool.query('SELECT d.*, u.name as uploader_name FROM datasets d LEFT JOIN users u ON d.uploaded_by=u.id WHERE d.id=$1', [req.params.id]);
    if (!dataset.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const tableName = `data_${req.params.id}`;
    const preview = await pool.query(`SELECT * FROM ${tableName} LIMIT 100`);
    res.json({ ...dataset.rows[0], preview: preview.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full data
router.get('/:id/data', authenticate, async (req, res) => {
  try {
    const { limit = 1000, offset = 0 } = req.query;
    const tableName = `data_${req.params.id}`;
    const data = await pool.query(`SELECT * FROM ${tableName} LIMIT $1 OFFSET $2`, [parseInt(limit), parseInt(offset)]);
    const count = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
    res.json({ rows: data.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get statistical summary
router.get('/:id/summary', authenticate, async (req, res) => {
  try {
    const tableName = `data_${req.params.id}`;
    const data = await pool.query(`SELECT * FROM ${tableName} LIMIT 5000`);
    const rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    const summary = computeFullSummary(rows);
    const quality = getDataQuality(rows);
    const correlation = computeCorrelationMatrix(rows);
    res.json({ summary, quality, correlation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete dataset
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.id]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && ds.rows[0].uploaded_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await pool.query(`DROP TABLE IF EXISTS data_${req.params.id}`);
    await pool.query('DELETE FROM datasets WHERE id=$1', [req.params.id]);
    res.json({ message: 'Dataset deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google Sheets import (public sheets via CSV export URL, or any direct CSV URL)
router.post('/google-sheets', authenticate, async (req, res) => {
  try {
    const { url, name: dsName } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    let csvUrl = url;
    // Convert Google Sheets edit URL to CSV export URL
    const sheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (sheetMatch) {
      const sheetId = sheetMatch[1];
      const gidMatch = url.match(/[#&]gid=(\d+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    }

    const axios = require('axios');
    const { Readable } = require('stream');
    const csvParser = require('csv-parser');

    const r = await axios.get(csvUrl, { responseType: 'text', timeout: 15000, headers: { Accept: 'text/csv' } });
    const content = r.data;

    const rows = [];
    await new Promise((resolve, reject) => {
      Readable.from([content]).pipe(csvParser()).on('data', row => rows.push(row)).on('end', resolve).on('error', reject);
    });

    if (!rows.length) return res.status(400).json({ error: 'Sheet is empty or not accessible. Make sure it is publicly shared.' });

    const cols = Object.keys(rows[0]);
    const schema = cols.map(col => {
      const vals = rows.slice(0, 100).map(r => r[col]).filter(v => v !== '' && v != null);
      const nums = vals.filter(v => !isNaN(Number(v)));
      return { name: col, type: nums.length > vals.length * 0.8 ? 'numeric' : 'text' };
    });

    const finalName = dsName || (sheetMatch ? 'Google Sheet Import' : `CSV: ${csvUrl.split('/').pop().split('?')[0]}`);
    const result = await pool.query(
      'INSERT INTO datasets (name, source, schema, row_count, column_count, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [finalName, 'google_sheets', JSON.stringify(schema), rows.length, cols.length, req.user.id]
    );
    const dataset = result.rows[0];
    const tableName = `data_${dataset.id}`;
    const safeCols = cols.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1').substring(0, 60).toLowerCase());
    const colDefs = safeCols.map((c, i) => `"${c}" ${schema[i].type === 'numeric' ? 'NUMERIC' : 'TEXT'}`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (row_index SERIAL, ${colDefs})`);

    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const valPH = batch.map((_, bi) => `(${safeCols.map((_, ci) => `$${bi * safeCols.length + ci + 1}`).join(',')})`).join(',');
      const flat = batch.flatMap(row => cols.map((c, ci) => {
        const v = row[c];
        return schema[ci].type === 'numeric' ? (isNaN(Number(v)) ? null : Number(v)) : (v ?? null);
      }));
      await pool.query(`INSERT INTO "${tableName}" (${safeCols.map(c => `"${c}"`).join(',')}) VALUES ${valPH}`, flat);
    }

    res.status(201).json({ ...dataset, rowCount: rows.length, columns: cols.length, preview: rows.slice(0, 5) });
  } catch (err) {
    const msg = err.response?.status === 403 ? 'Sheet is private. Share the sheet publicly (Anyone with link → Viewer) first.'
      : err.response?.status === 404 ? 'Sheet not found. Check the URL.'
      : err.message;
    res.status(500).json({ error: msg });
  }
});

// Large dataset streaming export (chunked CSV for millions of rows)
router.get('/:id/export/csv', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.id]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    const dataset = ds.rows[0];
    const schema = Array.isArray(dataset.schema) ? dataset.schema : [];
    const cols = schema.map(s => s.name);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}.csv"`);

    res.write(cols.map(c => `"${c}"`).join(',') + '\n');

    const CHUNK = 10000;
    let offset = 0;
    let done = false;
    while (!done) {
      const chunk = await pool.query(`SELECT * FROM "data_${dataset.id}" ORDER BY row_index LIMIT $1 OFFSET $2`, [CHUNK, offset]);
      if (!chunk.rows.length) { done = true; break; }
      for (const row of chunk.rows) {
        const line = cols.map(c => {
          const v = row[c] ?? '';
          const s = String(v);
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',');
        res.write(line + '\n');
      }
      offset += CHUNK;
      if (chunk.rows.length < CHUNK) done = true;
    }
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
