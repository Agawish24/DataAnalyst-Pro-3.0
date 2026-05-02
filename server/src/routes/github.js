const express = require('express');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const router = express.Router();

const GH = 'https://api.github.com';

const getCreds = async (userId) => {
  const r = await pool.query('SELECT credentials FROM integration_credentials WHERE user_id=$1 AND service=$2', [userId, 'github']);
  return r.rows[0]?.credentials || null;
};

const ghHeaders = (token) => ({
  Authorization: token ? `Bearer ${token}` : undefined,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'DataAnalystSuite/1.0'
});

router.get('/status', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    if (!creds?.token) return res.json({ connected: false, user: null });
    const r = await axios.get(`${GH}/user`, { headers: ghHeaders(creds.token), timeout: 6000 });
    res.json({ connected: true, user: r.data.login, name: r.data.name, avatar: r.data.avatar_url, public_repos: r.data.public_repos });
  } catch (e) { res.json({ connected: false, user: null, error: e.message }); }
});

router.post('/connect', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    const r = await axios.get(`${GH}/user`, { headers: ghHeaders(token), timeout: 6000 });
    await pool.query(
      'INSERT INTO integration_credentials (user_id, service, credentials, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, service) DO UPDATE SET credentials=$3, updated_at=NOW()',
      [req.user.id, 'github', JSON.stringify({ token })]
    );
    res.json({ ok: true, user: r.data.login, name: r.data.name, avatar: r.data.avatar_url });
  } catch (e) {
    const msg = e.response?.status === 401 ? 'Invalid GitHub token' : e.message;
    res.status(400).json({ error: msg });
  }
});

router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM integration_credentials WHERE user_id=$1 AND service=$2', [req.user.id, 'github']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    const { q = 'data csv', sort = 'stars', page = 1 } = req.query;
    const r = await axios.get(`${GH}/search/repositories`, {
      params: { q: `${q} in:name,description`, sort, per_page: 20, page },
      headers: ghHeaders(creds?.token), timeout: 10000
    });
    res.json({
      total: r.data.total_count,
      repos: r.data.items.map(repo => ({
        id: repo.id, name: repo.name, full_name: repo.full_name,
        description: repo.description, stars: repo.stargazers_count,
        language: repo.language, owner: repo.owner.login,
        avatar: repo.owner.avatar_url, url: repo.html_url,
        updated: repo.updated_at, size: repo.size, default_branch: repo.default_branch
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/repos/:owner/:repo/contents', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    const { path = '' } = req.query;
    const r = await axios.get(`${GH}/repos/${req.params.owner}/${req.params.repo}/contents/${path}`, {
      headers: ghHeaders(creds?.token), timeout: 8000
    });
    const items = Array.isArray(r.data) ? r.data : [r.data];
    res.json(items.map(item => ({
      name: item.name, path: item.path, type: item.type,
      size: item.size, url: item.html_url, download_url: item.download_url,
      sha: item.sha, isData: /\.(csv|json|tsv|xlsx|parquet)$/i.test(item.name)
    })));
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

router.get('/repos/:owner/:repo/tree', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    const branchRes = await axios.get(`${GH}/repos/${req.params.owner}/${req.params.repo}`, {
      headers: ghHeaders(creds?.token), timeout: 6000
    });
    const branch = branchRes.data.default_branch;
    const r = await axios.get(`${GH}/repos/${req.params.owner}/${req.params.repo}/git/trees/${branch}?recursive=1`, {
      headers: ghHeaders(creds?.token), timeout: 10000
    });
    const dataFiles = (r.data.tree || []).filter(f => f.type === 'blob' && /\.(csv|json|tsv)$/i.test(f.path));
    res.json({ branch, files: dataFiles.map(f => ({ path: f.path, size: f.size, url: `https://raw.githubusercontent.com/${req.params.owner}/${req.params.repo}/${branch}/${f.path}` })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/import', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id);
    const { owner, repo, path, branch = 'main', name: dsName } = req.body;
    if (!owner || !repo || !path) return res.status(400).json({ error: 'owner, repo, and path required' });
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const r = await axios.get(rawUrl, {
      headers: creds?.token ? { Authorization: `Bearer ${creds.token}` } : {},
      timeout: 20000, responseType: 'text'
    });
    const content = r.data;
    const isJson = path.endsWith('.json');
    let rows = [];
    let cols = [];
    if (isJson) {
      const parsed = JSON.parse(content);
      rows = Array.isArray(parsed) ? parsed : [parsed];
      cols = rows.length ? Object.keys(rows[0]) : [];
    } else {
      await new Promise((resolve, reject) => {
        Readable.from([content]).pipe(csvParser()).on('data', r => rows.push(r)).on('end', resolve).on('error', reject);
      });
      cols = rows.length ? Object.keys(rows[0]) : [];
    }
    if (!rows.length) return res.status(400).json({ error: 'File is empty' });
    const schemaArr = cols.map(c => {
      const vals = rows.slice(0, 100).map(r => r[c]).filter(v => v !== '' && v != null);
      return { name: c, type: vals.length > 0 && vals.every(v => !isNaN(Number(v))) ? 'numeric' : 'text' };
    });
    const schemaMap = Object.fromEntries(schemaArr.map(s => [s.name, s.type]));
    const finalName = dsName || `GitHub: ${owner}/${repo}/${path.split('/').pop()}`;
    const dsResult = await pool.query(
      'INSERT INTO datasets (name, source, row_count, column_count, schema, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [finalName, 'github', rows.length, cols.length, JSON.stringify(schemaArr), req.user.id]
    );
    const dsId = dsResult.rows[0].id;
    const tableName = `data_${dsId}`;
    const safeCols = cols.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1').toLowerCase());
    const colDefs = safeCols.map((_, i) => `"${safeCols[i]}" ${schemaMap[cols[i]] === 'numeric' ? 'NUMERIC' : 'TEXT'}`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (row_index SERIAL, ${colDefs})`);
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const vals = chunk.map((_, ri) => `(${safeCols.map((_, ci) => `$${ri * safeCols.length + ci + 1}`).join(',')})`).join(',');
      const flat = chunk.flatMap(row => safeCols.map((_, ci) => {
        const v = row[cols[ci]];
        return schemaMap[cols[ci]] === 'numeric' ? (isNaN(Number(v)) ? null : Number(v)) : (v ?? null);
      }));
      await pool.query(`INSERT INTO "${tableName}" (${safeCols.map(c => `"${c}"`).join(',')}) VALUES ${vals}`, flat);
    }
    res.json({ ok: true, datasetId: dsId, name: finalName, rowCount: rows.length, columns: cols.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
