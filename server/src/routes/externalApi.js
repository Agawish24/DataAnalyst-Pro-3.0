const express = require('express');
const pool = require('../db/pool');
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Middleware to authenticate by API key
const apiKeyAuth = async (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key) return res.status(401).json({ error: 'API key required. Pass X-Api-Key header.' });
  try {
    const result = await pool.query(
      'SELECT ak.*, u.id as user_id, u.name, u.role FROM api_keys ak JOIN users u ON ak.user_id=u.id WHERE ak.key_hash=$1 AND ak.is_active=true AND (ak.expires_at IS NULL OR ak.expires_at > NOW())',
      [crypto.createHash('sha256').update(key).digest('hex')]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid or expired API key' });
    req.user = result.rows[0];
    await pool.query('UPDATE api_keys SET last_used_at=NOW(), request_count=request_count+1 WHERE id=$1', [result.rows[0].id]);
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Manage API keys (authenticated users)
router.get('/keys', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, key_prefix, is_active, permissions, last_used_at, request_count, expires_at, created_at FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/keys', authenticate, async (req, res) => {
  try {
    const { name, permissions = ['read'], expires_days } = req.body;
    if (!name) return res.status(400).json({ error: 'Key name required' });

    const rawKey = `dap_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10) + '...';
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000) : null;

    const result = await pool.query(
      'INSERT INTO api_keys (name, key_hash, key_prefix, user_id, permissions, expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, key_prefix, is_active, permissions, expires_at, created_at',
      [name, keyHash, keyPrefix, req.user.id, JSON.stringify(permissions), expiresAt]
    );
    // Return the raw key ONCE — it won't be shown again
    res.status(201).json({ ...result.rows[0], raw_key: rawKey, warning: 'Store this key securely. It will not be shown again.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/keys/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE api_keys SET is_active=false WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'API key revoked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Public API endpoints (API key auth) ----
router.get('/v1/datasets', apiKeyAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, source, row_count, column_count, created_at FROM datasets ORDER BY created_at DESC');
    res.json({ data: result.rows, count: result.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/v1/datasets/:id/data', apiKeyAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 1000, 10000);
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(`SELECT * FROM data_${req.params.id} LIMIT $1 OFFSET $2`, [limit, offset]);
    res.json({ data: result.rows.map(r => { const { row_index, ...rest } = r; return rest; }), count: result.rows.length, limit, offset });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/v1/query', apiKeyAuth, async (req, res) => {
  try {
    const { sql, dataset_id } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL required' });
    const safeSql = sql.replace(/\bFROM\s+dataset\b/gi, `FROM data_${dataset_id}`);
    const result = await pool.query(safeSql);
    res.json({ data: result.rows, count: result.rows.length });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/v1/profile/:datasetId', apiKeyAuth, async (req, res) => {
  try {
    const cached = await pool.query('SELECT * FROM data_profiles WHERE dataset_id=$1 ORDER BY generated_at DESC LIMIT 1', [req.params.datasetId]);
    if (!cached.rows.length) return res.status(404).json({ error: 'No profile found. Generate one first.' });
    res.json(cached.rows[0].profile_data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
