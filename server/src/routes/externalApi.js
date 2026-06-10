const express = require('express');
const https = require('https');
const pool = require('../db/pool');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Consistent error response format ────────────────────────────────────────
const apiError = (res, status, code, message, hint = null) => {
  const body = { error: { code, message, status } };
  if (hint) body.error.hint = hint;
  body.error.docs_url = 'https://docs.dataanalystpro.com/api/errors';
  return res.status(status).json(body);
};

// ── RBAC permission map ───────────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  viewer:  ['read'],
  analyst: ['read', 'query'],
  admin:   ['read', 'write', 'query', 'admin'],
};

const hasPermission = (key, perm) => {
  const perms = Array.isArray(key.scopes) ? key.scopes : (JSON.parse(key.scopes || '[]'));
  return perms.includes(perm) || perms.includes('admin');
};

// ── In-memory rate limit store (per key, per 15-min window) ─────────────────
const rateLimitStore = new Map();
const checkRateLimit = (keyId, limitPerHour = 1000) => {
  const windowMs = 15 * 60 * 1000;
  const now = Date.now();
  const windowKey = `${keyId}:${Math.floor(now / windowMs)}`;
  const current = rateLimitStore.get(windowKey) || 0;
  const limit15 = Math.ceil(limitPerHour / 4); // per-15-min bucket
  if (current >= limit15) return { limited: true, remaining: 0, reset: Math.ceil((Math.floor(now / windowMs) + 1) * windowMs / 1000) };
  rateLimitStore.set(windowKey, current + 1);
  // Clean old entries
  if (rateLimitStore.size > 5000) {
    for (const [k] of rateLimitStore) { if (!k.includes(`:${Math.floor(now / windowMs)}`)) rateLimitStore.delete(k); }
  }
  return { limited: false, remaining: limit15 - current - 1, reset: Math.ceil((Math.floor(now / windowMs) + 1) * windowMs / 1000), limit: limit15 };
};

// ── Set rate-limit response headers ─────────────────────────────────────────
const setRateLimitHeaders = (res, rl) => {
  res.set('X-RateLimit-Limit', String(rl.limit || 250));
  res.set('X-RateLimit-Remaining', String(rl.remaining));
  res.set('X-RateLimit-Reset', String(rl.reset));
};

// ── API key authentication middleware ────────────────────────────────────────
const apiKeyAuth = async (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key) return apiError(res, 401, 'MISSING_API_KEY', 'API key required', 'Pass X-Api-Key header or ?api_key= query param');
  if (!key.startsWith('dap_')) return apiError(res, 401, 'INVALID_KEY_FORMAT', 'API key format invalid', 'Keys begin with dap_');
  try {
    const result = await pool.query(
      `SELECT ak.*, u.id as user_id, u.name as user_name, u.role as user_role
       FROM api_keys ak JOIN users u ON ak.user_id=u.id
       WHERE ak.key_hash=$1 AND ak.is_active=true AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
      [crypto.createHash('sha256').update(key).digest('hex')]
    );
    if (!result.rows.length) return apiError(res, 401, 'INVALID_OR_EXPIRED_KEY', 'Invalid or expired API key', 'Generate a new key at /external-api');
    const apiKey = result.rows[0];

    // Rate limit check
    const rl = checkRateLimit(apiKey.id, apiKey.rate_limit_per_hour || 1000);
    setRateLimitHeaders(res, rl);
    if (rl.limited) return apiError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', `Resets at ${new Date(rl.reset * 1000).toISOString()}`);

    req.apiKey = apiKey;
    req.user = { id: apiKey.user_id, name: apiKey.user_name, role: apiKey.user_role || apiKey.role || 'analyst' };
    req.requestStart = Date.now();

    // Update last_used + request count async (don't await)
    pool.query('UPDATE api_keys SET last_used=NOW(), request_count=request_count+1 WHERE id=$1', [apiKey.id]).catch(() => {});
    next();
  } catch (err) {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Authentication check failed', err.message);
  }
};

// ── Governance: write lineage event ─────────────────────────────────────────
const writeLineage = async (datasetId, endpoint, apiKey, rowsReturned = 0) => {
  if (!datasetId) return;
  try {
    await pool.query(
      `INSERT INTO lineage (dataset_id, event_type, actor, metadata)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [datasetId, 'api_query', `apikey:${apiKey.key_prefix}`,
       JSON.stringify({ endpoint, key_name: apiKey.name, key_id: apiKey.id, rows_returned: rowsReturned, queried_at: new Date().toISOString() })]
    );
  } catch { /* lineage write is best-effort */ }
};

// ── Log API usage ────────────────────────────────────────────────────────────
const logUsage = async (apiKey, endpoint, datasetId, rowsReturned, statusCode, req) => {
  const duration = req.requestStart ? Date.now() - req.requestStart : 0;
  try {
    await pool.query(
      `INSERT INTO api_usage_log (api_key_id, endpoint, dataset_id, rows_returned, status_code, ip_address, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [apiKey.id, endpoint, datasetId || null, rowsReturned, statusCode, req.ip || null, duration]
    );
    if (rowsReturned > 0) {
      pool.query('UPDATE api_keys SET rows_returned=rows_returned+$1 WHERE id=$2', [rowsReturned, apiKey.id]).catch(() => {});
    }
  } catch { /* log failures are silent */ }
};

// ── Groq AI usage narrative ──────────────────────────────────────────────────
const groqChat = (messages) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: 200, temperature: 0.3 });
  const req = https.request({
    hostname: 'api.groq.com', port: 443, path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(body) }
  }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(); } }); });
  req.on('error', reject); req.write(body); req.end();
});

// ════════════════════════════════════════════════════════════════════════════
// KEY MANAGEMENT  (authenticated user session)
// ════════════════════════════════════════════════════════════════════════════

router.get('/keys', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, key_prefix, is_active, scopes,
              last_used, request_count, created_at
       FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/keys', authenticate, async (req, res) => {
  try {
    const { name, role = 'analyst', permissions, expires_days, rate_limit_per_hour = 1000 } = req.body;
    if (!name) return res.status(400).json({ error: 'Key name required' });

    // Derive permissions from role if not explicitly set
    const resolvedPerms = permissions || ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.analyst;

    const rawKey = `dap_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12) + '...';
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000) : null;

    const result = await pool.query(
      `INSERT INTO api_keys (name, key_hash, key_prefix, user_id, scopes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, key_prefix, is_active, scopes, created_at`,
      [name, keyHash, keyPrefix, req.user.id, JSON.stringify(resolvedPerms)]
    );
    res.status(201).json({ ...result.rows[0], raw_key: rawKey, warning: 'Store this key securely — it will NOT be shown again.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/keys/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE api_keys SET is_active=false WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'API key revoked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Usage summary for a key (with optional AI narrative) ─────────────────────
router.get('/keys/:id/usage', authenticate, async (req, res) => {
  try {
    const keyRow = await pool.query('SELECT * FROM api_keys WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!keyRow.rows.length) return res.status(404).json({ error: 'Key not found' });
    const k = keyRow.rows[0];

    const logs = await pool.query(
      `SELECT endpoint, dataset_id, rows_returned, status_code, duration_ms, created_at
       FROM api_usage_log WHERE api_key_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [k.id]
    );

    const today = await pool.query(
      `SELECT COUNT(*) as requests, COALESCE(SUM(rows_returned),0) as rows
       FROM api_usage_log WHERE api_key_id=$1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [k.id]
    );

    const datasetHits = await pool.query(
      `SELECT dataset_id, COUNT(*) as hits FROM api_usage_log WHERE api_key_id=$1 AND dataset_id IS NOT NULL GROUP BY dataset_id ORDER BY hits DESC LIMIT 5`,
      [k.id]
    );

    const stats = {
      total_requests: k.request_count,
      total_rows: k.rows_returned || 0,
      requests_today: parseInt(today.rows[0].requests),
      rows_today: parseInt(today.rows[0].rows),
      top_datasets: datasetHits.rows,
      recent_logs: logs.rows,
    };

    // AI narrative
    let narrative = null;
    if (process.env.GROQ_API_KEY && stats.total_requests > 0) {
      try {
        const r = await groqChat([
          { role: 'system', content: 'Summarize API key usage in 1 concise sentence for a developer dashboard. Be specific about numbers.' },
          { role: 'user', content: `Key "${k.name}" (role: ${k.role}): ${stats.requests_today} requests today, ${stats.rows_today} rows returned today, ${stats.total_requests} total requests, ${stats.top_datasets.length} datasets queried.` }
        ]);
        narrative = r?.choices?.[0]?.message?.content || null;
      } catch { /* narrative is optional */ }
    }

    res.json({ ...stats, narrative });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API  (API key auth)
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/datasets
router.get('/v1/datasets', apiKeyAuth, async (req, res) => {
  if (!hasPermission(req.apiKey, 'read')) return apiError(res, 403, 'PERMISSION_DENIED', 'This key does not have read permission');
  try {
    const result = await pool.query(
      `SELECT d.id, d.name, d.source, d.row_count, d.column_count, d.created_at,
              u.name as owner
       FROM datasets d LEFT JOIN users u ON d.uploaded_by=u.id
       WHERE d.uploaded_by=$1
       ORDER BY d.created_at DESC`,
      [req.apiKey.user_id]
    );
    logUsage(req.apiKey, 'GET /v1/datasets', null, result.rows.length, 200, req);
    res.json({
      data: result.rows,
      count: result.rows.length,
      meta: { key_role: req.apiKey.role, api_version: 'v1' }
    });
  } catch (err) { return apiError(res, 500, 'INTERNAL_ERROR', err.message); }
});

// GET /v1/datasets/:id/data  — cursor-based pagination
router.get('/v1/datasets/:id/data', apiKeyAuth, async (req, res) => {
  if (!hasPermission(req.apiKey, 'read')) return apiError(res, 403, 'PERMISSION_DENIED', 'This key does not have read permission');
  try {
    const dsId = parseInt(req.params.id);
    if (isNaN(dsId)) return apiError(res, 400, 'INVALID_DATASET_ID', 'dataset id must be an integer');

    const limit = Math.min(parseInt(req.query.limit) || 500, 10000);

    // Cursor-based: cursor = last seen row_index; fallback to offset
    const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;

    let result;
    if (cursor !== null) {
      result = await pool.query(
        `SELECT * FROM data_${dsId} WHERE row_index > $1 ORDER BY row_index ASC LIMIT $2`,
        [cursor, limit]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM data_${dsId} ORDER BY row_index ASC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }

    const rows = result.rows.map(r => { const { row_index, ...rest } = r; return { _cursor: r.row_index, ...rest }; });
    const nextCursor = rows.length === limit ? rows[rows.length - 1]._cursor : null;

    // Governance lineage write
    writeLineage(dsId, 'GET /v1/datasets/:id/data', req.apiKey, rows.length);
    logUsage(req.apiKey, 'GET /v1/datasets/:id/data', dsId, rows.length, 200, req);

    res.json({
      data: rows.map(({ _cursor, ...r }) => r),
      count: rows.length,
      limit,
      next_cursor: nextCursor,
      has_more: nextCursor !== null,
      // also return offset-style for backwards compat
      offset: cursor !== null ? null : offset,
      meta: { dataset_id: dsId, cursor_field: 'row_index', api_version: 'v1' }
    });
  } catch (err) {
    if (err.message?.includes('does not exist')) return apiError(res, 404, 'DATASET_NOT_FOUND', `Dataset ${req.params.id} not found`, 'Check the dataset ID at GET /v1/datasets');
    return apiError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// POST /v1/query  — SQL query with SELECT-only guard + RBAC
router.post('/v1/query', apiKeyAuth, async (req, res) => {
  if (!hasPermission(req.apiKey, 'query')) return apiError(res, 403, 'PERMISSION_DENIED', 'This key does not have query permission', 'Upgrade key role to analyst or admin');
  try {
    const { sql, dataset_id } = req.body;
    if (!sql) return apiError(res, 400, 'MISSING_SQL', 'sql field is required');

    // Strict read-only guard
    const normalised = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim().toUpperCase();
    const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'EXECUTE', 'CALL', 'DO'];
    const found = forbidden.find(kw => new RegExp(`\\b${kw}\\b`).test(normalised));
    if (found) return apiError(res, 403, 'READ_ONLY_VIOLATION', `${found} is not allowed — API queries must be SELECT only`);

    if (!normalised.startsWith('SELECT') && !normalised.startsWith('WITH')) {
      return apiError(res, 400, 'INVALID_QUERY', 'Query must start with SELECT or WITH');
    }

    // Replace generic "dataset" table reference with actual table
    const safeSql = dataset_id
      ? sql.replace(/\bFROM\s+dataset\b/gi, `FROM data_${dataset_id}`)
      : sql;

    const result = await pool.query(safeSql);
    const rows = result.rows;

    // Governance
    writeLineage(dataset_id, 'POST /v1/query', req.apiKey, rows.length);
    logUsage(req.apiKey, 'POST /v1/query', dataset_id || null, rows.length, 200, req);

    res.json({
      data: rows,
      count: rows.length,
      meta: { dataset_id: dataset_id || null, read_only: true, api_version: 'v1' }
    });
  } catch (err) {
    logUsage(req.apiKey, 'POST /v1/query', null, 0, 400, req);
    if (err.message?.includes('syntax')) return apiError(res, 400, 'SQL_SYNTAX_ERROR', err.message, 'Check your SQL syntax');
    if (err.message?.includes('does not exist')) return apiError(res, 404, 'TABLE_NOT_FOUND', err.message, 'Verify dataset_id and column names');
    return apiError(res, 400, 'QUERY_ERROR', err.message);
  }
});

// GET /v1/profile/:datasetId
router.get('/v1/profile/:datasetId', apiKeyAuth, async (req, res) => {
  if (!hasPermission(req.apiKey, 'read')) return apiError(res, 403, 'PERMISSION_DENIED', 'This key does not have read permission');
  try {
    const cached = await pool.query(
      'SELECT * FROM data_profiles WHERE dataset_id=$1 ORDER BY generated_at DESC LIMIT 1',
      [req.params.datasetId]
    );
    if (!cached.rows.length) return apiError(res, 404, 'PROFILE_NOT_FOUND', 'No profile found for this dataset', 'Generate a profile from the Profiling page first');
    writeLineage(req.params.datasetId, 'GET /v1/profile/:datasetId', req.apiKey, 0);
    logUsage(req.apiKey, 'GET /v1/profile/:datasetId', req.params.datasetId, 0, 200, req);
    res.json(cached.rows[0].profile_data);
  } catch (err) { return apiError(res, 500, 'INTERNAL_ERROR', err.message); }
});

// GET /v1/usage  — aggregate usage across all keys
router.get('/v1/usage', apiKeyAuth, async (req, res) => {
  try {
    const stats = await pool.query(
      `SELECT COUNT(*) as total_requests, COALESCE(SUM(rows_returned),0) as total_rows,
              COUNT(DISTINCT dataset_id) as datasets_queried
       FROM api_usage_log WHERE api_key_id=$1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [req.apiKey.id]
    );
    logUsage(req.apiKey, 'GET /v1/usage', null, 0, 200, req);
    res.json({ ...stats.rows[0], key_name: req.apiKey.name, key_role: req.apiKey.role, period: '24h' });
  } catch (err) { return apiError(res, 500, 'INTERNAL_ERROR', err.message); }
});

module.exports = router;
