const express = require('express');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const router = express.Router();

const getCreds = async (userId) => {
  const r = await pool.query('SELECT credentials FROM integration_credentials WHERE user_id=$1 AND service=$2', [userId, 'kaggle']);
  return r.rows[0]?.credentials || null;
};

router.get('/status', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    res.json({ connected: !!(creds?.username && creds?.apiKey), username: creds?.username || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/connect', authenticate, async (req, res) => {
  try {
    const { username, apiKey } = req.body;
    if (!username || !apiKey) return res.status(400).json({ error: 'username and apiKey required' });
    const token = Buffer.from(`${username}:${apiKey}`).toString('base64');
    await axios.get('https://www.kaggle.com/api/v1/datasets/list?page=1&pageSize=1', {
      headers: { Authorization: `Basic ${token}` }, timeout: 8000
    });
    await pool.query(
      'INSERT INTO integration_credentials (user_id, service, credentials, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, service) DO UPDATE SET credentials=$3, updated_at=NOW()',
      [req.user.id, 'kaggle', JSON.stringify({ username, apiKey })]
    );
    res.json({ ok: true, username });
  } catch (e) {
    const msg = e.response?.status === 401 ? 'Invalid Kaggle credentials' : e.message;
    res.status(400).json({ error: msg });
  }
});

router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM integration_credentials WHERE user_id=$1 AND service=$2', [req.user.id, 'kaggle']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    if (!creds) return res.status(401).json({ error: 'Not connected to Kaggle' });
    const { q = '', page = 1, sort = 'hottest' } = req.query;
    const token = Buffer.from(`${creds.username}:${creds.apiKey}`).toString('base64');
    const r = await axios.get('https://www.kaggle.com/api/v1/datasets/list', {
      params: { search: q, page, pageSize: 20, sortBy: sort, filetype: 'csv' },
      headers: { Authorization: `Basic ${token}` }, timeout: 10000
    });
    const datasets = (r.data || []).map(d => ({
      ref: `${d.ownerUser}/${d.currentDatasetVersionNumber ? d.ref?.split('/').pop() : d.title?.toLowerCase().replace(/\s+/g, '-')}`,
      fullRef: d.ref,
      title: d.title,
      subtitle: d.subtitle,
      owner: d.ownerUser,
      size: d.totalBytes,
      lastUpdated: d.lastUpdated,
      downloadCount: d.downloadCount,
      voteCount: d.voteCount,
      usabilityRating: d.usabilityRating,
      tags: d.tags?.map(t => t.name) || [],
      url: `https://www.kaggle.com/datasets/${d.ref}`
    }));
    res.json({ datasets, total: datasets.length });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

router.get('/datasets/list', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    if (!creds) return res.status(401).json({ error: 'Not connected to Kaggle' });
    const token = Buffer.from(`${creds.username}:${creds.apiKey}`).toString('base64');
    const r = await axios.get('https://www.kaggle.com/api/v1/datasets/list', {
      params: { user: creds.username, pageSize: 20 },
      headers: { Authorization: `Basic ${token}` }, timeout: 10000
    });
    res.json(r.data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/import', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    if (!creds) return res.status(401).json({ error: 'Not connected to Kaggle' });
    const { datasetRef, fileName } = req.body;
    if (!datasetRef) return res.status(400).json({ error: 'datasetRef required (e.g. owner/dataset-name)' });
    const token = Buffer.from(`${creds.username}:${creds.apiKey}`).toString('base64');
    const [owner, name] = datasetRef.split('/');
    const filesRes = await axios.get(`https://www.kaggle.com/api/v1/datasets/${owner}/${name}`, {
      headers: { Authorization: `Basic ${token}` }, timeout: 10000
    });
    const files = filesRes.data?.files || [];
    const csvFile = fileName ? files.find(f => f.name === fileName) : files.find(f => f.name?.endsWith('.csv') || f.datasetDataFileId);
    if (!csvFile && files.length === 0) return res.status(404).json({ error: 'No files found in dataset' });
    const targetFile = csvFile || files[0];
    const dlRes = await axios.get(
      `https://www.kaggle.com/api/v1/datasets/${owner}/${name}/download/${encodeURIComponent(targetFile.name)}`,
      { headers: { Authorization: `Basic ${token}` }, responseType: 'arraybuffer', timeout: 30000 }
    );
    const content = Buffer.from(dlRes.data).toString('utf8');
    const rows = [];
    await new Promise((resolve, reject) => {
      Readable.from([content]).pipe(csvParser()).on('data', r => rows.push(r)).on('end', resolve).on('error', reject);
    });
    if (!rows.length) return res.status(400).json({ error: 'Dataset is empty or not CSV format' });
    const cols = Object.keys(rows[0]);
    const schema = {};
    cols.forEach(c => {
      const vals = rows.slice(0, 100).map(r => r[c]).filter(v => v !== '' && v != null);
      const numeric = vals.every(v => !isNaN(Number(v)));
      schema[c] = numeric ? 'numeric' : 'text';
    });
    const dsName = `Kaggle: ${filesRes.data?.title || name}`;
    const dsResult = await pool.query(
      'INSERT INTO datasets (name, source, row_count, schema, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [dsName, 'kaggle', rows.length, JSON.stringify(schema), req.user.id]
    );
    const dsId = dsResult.rows[0].id;
    const tableName = `data_${dsId}`;
    const safeCols = cols.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1').toLowerCase());
    const colDefs = safeCols.map((c, i) => `"${c}" ${schema[cols[i]] === 'numeric' ? 'NUMERIC' : 'TEXT'}`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (row_index SERIAL, ${colDefs})`);
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const vals = chunk.map((row, ri) => `(${safeCols.map((_, ci) => `$${ri * safeCols.length + ci + 1}`).join(',')})`).join(',');
      const flat = chunk.flatMap(row => safeCols.map((_, ci) => {
        const v = row[cols[ci]];
        return schema[cols[ci]] === 'numeric' ? (isNaN(Number(v)) ? null : Number(v)) : (v ?? null);
      }));
      await pool.query(`INSERT INTO "${tableName}" (${safeCols.map(c => `"${c}"`).join(',')}) VALUES ${vals}`, flat);
    }
    res.json({ ok: true, datasetId: dsId, name: dsName, rowCount: rows.length, columns: cols.length, file: targetFile.name });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

module.exports = router;
