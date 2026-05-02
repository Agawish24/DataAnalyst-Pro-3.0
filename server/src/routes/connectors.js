const express = require('express');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { Pool: PgPool } = require('pg');
const jwt = require('jsonwebtoken');

const router = express.Router();

const getBigQueryToken = async (keyFileContent) => {
  let creds;
  try { creds = typeof keyFileContent === 'string' ? JSON.parse(keyFileContent) : keyFileContent; }
  catch { throw new Error('Invalid BigQuery key file JSON'); }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email,
    sub: creds.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/bigquery'
  };
  const token = jwt.sign(payload, creds.private_key, { algorithm: 'RS256' });
  const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: token
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });
  return r.data.access_token;
};

const testConnection = async (type, config) => {
  if (type === 'postgresql' || type === 'postgres') {
    const client = new PgPool({
      connectionString: config.connectionString || `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database}`,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000
    });
    try { const r = await client.query('SELECT version()'); await client.end(); return { ok: true, version: r.rows[0].version }; }
    catch (e) { await client.end().catch(() => {}); return { ok: false, error: e.message }; }
  }
  if (type === 'mysql') {
    try {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({ host: config.host, port: config.port || 3306, user: config.user, password: config.password, database: config.database, connectTimeout: 5000 });
      const [rows] = await conn.execute('SELECT VERSION() as v');
      await conn.end();
      return { ok: true, version: rows[0].v };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  if (type === 'redshift') {
    const client = new PgPool({
      host: config.host, port: config.port || 5439, database: config.database,
      user: config.user, password: config.password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000
    });
    try { const r = await client.query('SELECT version()'); await client.end(); return { ok: true, version: r.rows[0].version }; }
    catch (e) { await client.end().catch(() => {}); return { ok: false, error: e.message }; }
  }
  if (type === 'bigquery') {
    try {
      const token = await getBigQueryToken(config.keyFileContent);
      const r = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${config.projectId}/datasets`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 8000
      });
      const datasets = (r.data.datasets || []).map(d => d.datasetReference.datasetId);
      return { ok: true, version: `BigQuery · ${datasets.length} dataset(s): ${datasets.slice(0, 3).join(', ')}` };
    } catch (e) { return { ok: false, error: e.response?.data?.error?.message || e.message }; }
  }
  if (type === 'snowflake') {
    return { ok: false, error: 'Snowflake requires a Snowflake JDBC driver not available in this environment. Use the connection string approach via PostgreSQL connector instead.' };
  }
  if (type === 'csv_url') {
    try {
      const r = await axios.head(config.url, { timeout: 5000 });
      return { ok: true, version: `HTTP ${r.status} · Content-Type: ${r.headers['content-type']}` };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  return { ok: false, error: `Unsupported connector type: ${type}` };
};

const queryConnector = async (connector, sql) => {
  const config = connector.config;
  const type = connector.type;
  const clean = sql.trim().toUpperCase();
  if (!clean.startsWith('SELECT') && !clean.startsWith('WITH') && !clean.startsWith('SHOW') && !clean.startsWith('DESCRIBE'))
    throw new Error('Only SELECT / WITH / SHOW / DESCRIBE queries allowed on external connectors');

  if (type === 'postgresql' || type === 'postgres') {
    const client = new PgPool({
      connectionString: config.connectionString || `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database}`,
      ssl: config.ssl ? { rejectUnauthorized: false } : false
    });
    try { const r = await client.query(sql); await client.end(); return r.rows; }
    catch (e) { await client.end().catch(() => {}); throw e; }
  }
  if (type === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({ host: config.host, port: config.port || 3306, user: config.user, password: config.password, database: config.database });
    const [rows] = await conn.execute(sql);
    await conn.end();
    return rows;
  }
  if (type === 'redshift') {
    const client = new PgPool({
      host: config.host, port: config.port || 5439, database: config.database,
      user: config.user, password: config.password,
      ssl: { rejectUnauthorized: false }
    });
    try { const r = await client.query(sql); await client.end(); return r.rows; }
    catch (e) { await client.end().catch(() => {}); throw e; }
  }
  if (type === 'bigquery') {
    const token = await getBigQueryToken(config.keyFileContent);
    const body = { query: sql, useLegacySql: false, timeoutMs: 30000 };
    if (config.defaultDataset) body.defaultDataset = { projectId: config.projectId, datasetId: config.defaultDataset };
    const r = await axios.post(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${config.projectId}/queries`,
      body,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 35000 }
    );
    const fields = r.data.schema?.fields || [];
    const rows = (r.data.rows || []).map(row => {
      const obj = {};
      fields.forEach((f, i) => { obj[f.name] = row.f[i]?.v; });
      return obj;
    });
    return rows;
  }
  if (type === 'csv_url') {
    const r = await axios.get(config.url, { timeout: 15000, responseType: 'text' });
    const csvParser = require('csv-parser');
    const { Readable } = require('stream');
    const rows = [];
    await new Promise((resolve, reject) => {
      Readable.from([r.data]).pipe(csvParser()).on('data', d => rows.push(d)).on('end', resolve).on('error', reject);
    });
    return rows;
  }
  throw new Error('Unsupported connector type');
};

router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, type, status, last_tested, created_at, created_by FROM connectors WHERE created_by=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, type, config } = req.body;
    if (!name || !type || !config) return res.status(400).json({ error: 'name, type, and config are required' });
    const testResult = await testConnection(type, config);
    const status = testResult.ok ? 'active' : 'error';
    const safeConfig = { ...config };
    if (safeConfig.password) safeConfig.password = '***stored***';
    const r = await pool.query(
      'INSERT INTO connectors (name, type, config, status, last_tested, created_by) VALUES ($1,$2,$3,$4,NOW(),$5) RETURNING id, name, type, status, last_tested',
      [name, type, JSON.stringify(config), status, req.user.id]
    );
    res.status(201).json({ ...r.rows[0], testResult });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/test', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM connectors WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const testResult = await testConnection(r.rows[0].type, r.rows[0].config);
    await pool.query('UPDATE connectors SET status=$1, last_tested=NOW() WHERE id=$2', [testResult.ok ? 'active' : 'error', req.params.id]);
    res.json(testResult);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/query', authenticate, async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'sql is required' });
    const r = await pool.query('SELECT * FROM connectors WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const rows = await queryConnector(r.rows[0], sql);
    res.json({ rows, rowCount: rows.length, connector: r.rows[0].name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/schema', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM connectors WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const c = r.rows[0];
    let schema = [];

    if (c.type === 'postgresql' || c.type === 'postgres' || c.type === 'redshift') {
      schema = await queryConnector(c, "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position");
    } else if (c.type === 'mysql') {
      schema = await queryConnector(c, `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name, DATA_TYPE as data_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`);
    } else if (c.type === 'bigquery') {
      const token = await getBigQueryToken(c.config.keyFileContent);
      const datasetsRes = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${c.config.projectId}/datasets`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 8000
      });
      const datasets = datasetsRes.data.datasets || [];
      for (const ds of datasets.slice(0, 5)) {
        const dsId = ds.datasetReference.datasetId;
        try {
          const tablesRes = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${c.config.projectId}/datasets/${dsId}/tables`, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 8000
          });
          for (const tbl of (tablesRes.data.tables || []).slice(0, 10)) {
            const tblId = tbl.tableReference.tableId;
            const tblRes = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${c.config.projectId}/datasets/${dsId}/tables/${tblId}`, {
              headers: { Authorization: `Bearer ${token}` }, timeout: 8000
            });
            (tblRes.data.schema?.fields || []).forEach(f => {
              schema.push({ table_name: `${dsId}.${tblId}`, column_name: f.name, data_type: f.type.toLowerCase() });
            });
          }
        } catch {}
      }
    } else if (c.type === 'csv_url') {
      const rows = await queryConnector(c, 'SELECT *');
      if (rows.length) {
        const tableName = c.config.url.split('/').pop().replace(/\.[^.]+$/, '') || 'csv_data';
        Object.keys(rows[0]).forEach(col => schema.push({ table_name: tableName, column_name: col, data_type: 'text' }));
      }
    }

    res.json({
      connector: c.name,
      tables: [...new Set(schema.map(s => s.table_name))].map(t => ({
        table: t,
        columns: schema.filter(s => s.table_name === t).map(s => ({ name: s.column_name, type: s.data_type }))
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM connectors WHERE id=$1 AND created_by=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Connector deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/types', authenticate, (req, res) => {
  res.json([
    { type: 'postgresql', label: 'PostgreSQL', color: '#336791', fields: ['host', 'port', 'database', 'user', 'password'], optional: ['ssl', 'connectionString'], description: 'Connect to any PostgreSQL database' },
    { type: 'mysql', label: 'MySQL / MariaDB', color: '#f29111', fields: ['host', 'port', 'database', 'user', 'password'], description: 'Connect to MySQL or MariaDB databases' },
    { type: 'redshift', label: 'Amazon Redshift', color: '#8c4fff', fields: ['host', 'port', 'database', 'user', 'password'], description: 'Amazon Redshift data warehouse (port 5439)' },
    { type: 'bigquery', label: 'Google BigQuery', color: '#4285f4', fields: ['projectId', 'keyFileContent'], optional: ['defaultDataset'], description: 'Google BigQuery analytics warehouse' },
    { type: 'csv_url', label: 'Remote CSV URL', color: '#10b981', fields: ['url'], description: 'Fetch and query a CSV file from any URL' },
    { type: 'snowflake', label: 'Snowflake', color: '#29b5e8', fields: ['account', 'warehouse', 'database', 'schema', 'user', 'password'], description: 'Snowflake cloud data platform (driver not available in this environment)' },
  ]);
});

module.exports = router;
