const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { Pool: PgPool } = require('pg');

const router = express.Router();

const testConnection = async (type, config) => {
  if (type === 'postgresql' || type === 'postgres') {
    const client = new PgPool({ connectionString: config.connectionString || `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database}`, ssl: config.ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 5000 });
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
  return { ok: false, error: `Unsupported connector type: ${type}` };
};

const queryConnector = async (connector, sql) => {
  const config = connector.config;
  const type = connector.type;
  const clean = sql.trim().toUpperCase();
  if (!clean.startsWith('SELECT') && !clean.startsWith('WITH')) throw new Error('Only SELECT queries allowed on external connectors');

  if (type === 'postgresql' || type === 'postgres') {
    const client = new PgPool({ connectionString: config.connectionString || `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database}`, ssl: config.ssl ? { rejectUnauthorized: false } : false });
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
    if (c.type === 'postgresql' || c.type === 'postgres') {
      const rows = await queryConnector(c, "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position");
      schema = rows;
    } else if (c.type === 'mysql') {
      const rows = await queryConnector(c, `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name, DATA_TYPE as data_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`);
      schema = rows;
    }
    res.json({ connector: c.name, tables: [...new Set(schema.map(s => s.table_name))].map(t => ({ table: t, columns: schema.filter(s => s.table_name === t).map(s => ({ name: s.column_name, type: s.data_type })) })) });
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
    { type: 'postgresql', label: 'PostgreSQL', fields: ['host', 'port', 'database', 'user', 'password', 'ssl'] },
    { type: 'mysql', label: 'MySQL / MariaDB', fields: ['host', 'port', 'database', 'user', 'password'] },
    { type: 'snowflake', label: 'Snowflake (via JDBC)', fields: ['account', 'warehouse', 'database', 'schema', 'user', 'password'] },
    { type: 'bigquery', label: 'BigQuery', fields: ['projectId', 'keyFile'] },
    { type: 'redshift', label: 'Amazon Redshift', fields: ['host', 'port', 'database', 'user', 'password'] },
    { type: 'csv_url', label: 'Remote CSV URL', fields: ['url'] },
  ]);
});

module.exports = router;
