const express = require('express');
const https = require('https');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const SCOPES        = 'ZohoCRM.modules.READ,ZohoCRM.modules.WRITE,ZohoCRM.contacts.READ,ZohoCRM.leads.READ,ZohoCRM.deals.READ';

// ── Ensure zoho_tokens table exists ────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS zoho_tokens (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    access_token  TEXT,
    refresh_token TEXT NOT NULL,
    api_domain    TEXT NOT NULL DEFAULT 'https://www.zohoapis.com',
    expires_at    BIGINT,
    scope         TEXT,
    connected_at  TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
  )
`).catch(e => console.error('[zoho] table init error:', e.message));

// ── Helpers ────────────────────────────────────────────────────────────────
function getRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/zoho/callback`;
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

function httpsPost(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = typeof payload === 'string' ? payload : new URLSearchParams(payload).toString();
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getValidToken(userId) {
  const r = await pool.query('SELECT * FROM zoho_tokens WHERE user_id=$1', [userId]);
  if (!r.rows.length) return null;
  const row = r.rows[0];

  // Refresh if expired or within 5 min of expiry
  if (row.expires_at && Date.now() > row.expires_at - 300_000) {
    const res = await httpsPost('https://accounts.zoho.com/oauth/v2/token', {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: row.refresh_token,
    });
    if (res.body.access_token) {
      const expiresAt = Date.now() + (res.body.expires_in || 3600) * 1000;
      await pool.query(
        'UPDATE zoho_tokens SET access_token=$1, expires_at=$2, updated_at=NOW() WHERE user_id=$3',
        [res.body.access_token, expiresAt, userId]
      );
      return { ...row, access_token: res.body.access_token, api_domain: row.api_domain };
    }
    return null;
  }
  return row;
}

async function zohoGet(userId, path) {
  const tok = await getValidToken(userId);
  if (!tok) throw new Error('Not connected to Zoho');
  const base = tok.api_domain || 'https://www.zohoapis.com';
  return httpsGet(`${base}${path}`, { Authorization: `Zoho-oauthtoken ${tok.access_token}` });
}

// ── GET /api/zoho/status ────────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT user_id, api_domain, scope, connected_at, updated_at FROM zoho_tokens WHERE user_id=$1',
      [req.user.id]
    );
    if (!r.rows.length) return res.json({ connected: false });
    res.json({ connected: true, ...r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/zoho/connect — redirect user to Zoho OAuth ───────────────────
router.get('/connect', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  let userId = 1;  // Default to demo user if no auth
  
  if (token) {
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      userId = decoded.id;
    } catch (e) {
      // If token invalid, use demo user
    }
  }
  
  const redirectUri = getRedirectUri(req);
  const state = Buffer.from(JSON.stringify({ userId, redirectUri })).toString('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri,
    access_type: 'offline',
    state,
  });
  res.redirect(`https://accounts.zoho.com/oauth/v2/auth?${params}`);
});

// ── GET /api/zoho/callback — handle Zoho redirect ─────────────────────────
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/zoho?error=${encodeURIComponent(error)}`);
    if (!code || !state) return res.redirect('/zoho?error=missing_params');

    let userId, redirectUri;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      userId = decoded.userId;
      redirectUri = decoded.redirectUri;
    } catch { return res.redirect('/zoho?error=invalid_state'); }

    const tokenRes = await httpsPost('https://accounts.zoho.com/oauth/v2/token', {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    });

    const t = tokenRes.body;
    if (!t.access_token || !t.refresh_token) {
      return res.redirect(`/zoho?error=${encodeURIComponent(t.error || 'token_exchange_failed')}`);
    }

    const expiresAt = Date.now() + (t.expires_in || 3600) * 1000;
    await pool.query(`
      INSERT INTO zoho_tokens (user_id, access_token, refresh_token, api_domain, expires_at, scope)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO UPDATE SET
        access_token=$2, refresh_token=$3, api_domain=$4, expires_at=$5, scope=$6, updated_at=NOW()
    `, [userId, t.access_token, t.refresh_token, t.api_domain || 'https://www.zohoapis.com', expiresAt, t.scope || SCOPES]);

    res.redirect('/zoho?connected=1');
  } catch (e) {
    console.error('[zoho callback]', e.message);
    res.redirect(`/zoho?error=${encodeURIComponent(e.message)}`);
  }
});

// ── POST /api/zoho/disconnect ──────────────────────────────────────────────
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM zoho_tokens WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'Zoho disconnected' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/zoho/contacts ─────────────────────────────────────────────────
router.get('/contacts', authenticate, async (req, res) => {
  try {
    const { page = 1, per_page = 50, search = '' } = req.query;
    let path = `/crm/v6/Contacts?page=${page}&per_page=${per_page}&fields=First_Name,Last_Name,Email,Phone,Account_Name,Lead_Source,Created_Time,Modified_Time`;
    if (search) path += `&criteria=(Full_Name:contains:${encodeURIComponent(search)})`;
    const r = await zohoGet(req.user.id, path);
    if (r.status !== 200) return res.status(r.status).json({ error: r.body?.message || 'Zoho API error', code: r.body?.code });
    res.json({ data: r.body.data || [], info: r.body.info });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/zoho/leads ────────────────────────────────────────────────────
router.get('/leads', authenticate, async (req, res) => {
  try {
    const { page = 1, per_page = 50 } = req.query;
    const path = `/crm/v6/Leads?page=${page}&per_page=${per_page}&fields=First_Name,Last_Name,Email,Phone,Company,Lead_Source,Lead_Status,Annual_Revenue,Created_Time`;
    const r = await zohoGet(req.user.id, path);
    if (r.status !== 200) return res.status(r.status).json({ error: r.body?.message || 'Zoho API error' });
    res.json({ data: r.body.data || [], info: r.body.info });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/zoho/deals ────────────────────────────────────────────────────
router.get('/deals', authenticate, async (req, res) => {
  try {
    const { page = 1, per_page = 50 } = req.query;
    const path = `/crm/v6/Deals?page=${page}&per_page=${per_page}&fields=Deal_Name,Account_Name,Amount,Stage,Closing_Date,Owner,Lead_Source,Probability,Created_Time`;
    const r = await zohoGet(req.user.id, path);
    if (r.status !== 200) return res.status(r.status).json({ error: r.body?.message || 'Zoho API error' });
    res.json({ data: r.body.data || [], info: r.body.info });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/zoho/accounts ─────────────────────────────────────────────────
router.get('/accounts', authenticate, async (req, res) => {
  try {
    const { page = 1, per_page = 50 } = req.query;
    const path = `/crm/v6/Accounts?page=${page}&per_page=${per_page}&fields=Account_Name,Industry,Phone,Website,Annual_Revenue,Employees,Owner,Created_Time`;
    const r = await zohoGet(req.user.id, path);
    if (r.status !== 200) return res.status(r.status).json({ error: r.body?.message || 'Zoho API error' });
    res.json({ data: r.body.data || [], info: r.body.info });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/zoho/modules — list all available modules ────────────────────
router.get('/modules', authenticate, async (req, res) => {
  try {
    const r = await zohoGet(req.user.id, '/crm/v6/settings/modules');
    if (r.status !== 200) return res.status(r.status).json({ error: r.body?.message || 'Zoho API error' });
    const modules = (r.body.modules || []).filter(m => m.api_supported).map(m => ({
      api_name: m.api_name, singular_label: m.singular_label, plural_label: m.plural_label,
      creatable: m.creatable, editable: m.editable, deletable: m.deletable,
    }));
    res.json({ modules });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/zoho/org — organisation info ─────────────────────────────────
router.get('/org', authenticate, async (req, res) => {
  try {
    const r = await zohoGet(req.user.id, '/crm/v6/org');
    if (r.status !== 200) return res.status(r.status).json({ error: r.body?.message || 'Zoho API error' });
    res.json(r.body.org?.[0] || {});
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
