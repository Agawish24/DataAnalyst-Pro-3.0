const express = require('express');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const HUB = 'https://api.hubapi.com';

const getCreds = async (userId, provider) => {
  const r = await pool.query('SELECT credentials FROM crm_connections WHERE user_id=$1 AND service=$2', [userId, provider]);
  return r.rows[0]?.credentials || null;
};

const hubHeaders = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

// GET /connections — list all CRM connections for the user
router.get('/connections', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, service, connected_at,
              CASE WHEN credentials IS NOT NULL THEN true ELSE false END as connected
       FROM crm_connections WHERE user_id=$1 ORDER BY connected_at DESC`,
      [req.user.id]
    );
    // Return status for all known providers even if not connected
    const providers = ['hubspot', 'salesforce', 'zoho'];
    const connected = new Map(r.rows.map(row => [row.service, row]));
    const result = providers.map(p => ({
      provider: p,
      connected: connected.has(p),
      connectedAt: connected.get(p)?.connected_at || null,
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/contacts', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT service, connected_at FROM crm_connections WHERE user_id=$1',
      [req.user.id]
    );
    res.json({
      connected: r.rows.map(c => c.service),
      message: r.rows.length
        ? `Connected to: ${r.rows.map(c => c.service).join(', ')} — use provider-specific endpoints to fetch contacts`
        : 'No CRM connected — use /crm/hubspot/connect, /crm/salesforce/connect, or /crm/zoho/connect',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── HubSpot ──────────────────────────────────────────────────

router.get('/hubspot/status', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'hubspot');
    if (!creds?.token) return res.json({ connected: false });
    const r = await axios.get(`${HUB}/crm/v3/objects/contacts?limit=1`, { headers: hubHeaders(creds.token), timeout: 6000 });
    res.json({ connected: true, plan: 'Private App' });
  } catch (e) { res.json({ connected: false, error: e.response?.data?.message || e.message }); }
});

router.post('/hubspot/connect', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Private App token required' });
    const r = await axios.get(`${HUB}/crm/v3/objects/contacts?limit=1`, { headers: hubHeaders(token), timeout: 8000 });
    await pool.query(
      'INSERT INTO crm_connections (user_id, service, credentials, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, service) DO UPDATE SET credentials=$3, updated_at=NOW()',
      [req.user.id, 'hubspot', JSON.stringify({ token })]
    );
    res.json({ ok: true, message: 'Connected to HubSpot' });
  } catch (e) {
    res.status(400).json({ error: e.response?.status === 401 ? 'Invalid HubSpot token' : e.response?.data?.message || e.message });
  }
});

router.delete('/hubspot/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_connections WHERE user_id=$1 AND service=$2', [req.user.id, 'hubspot']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const hubFetch = async (token, objectType, after, limit = 100, properties = []) => {
  const params = { limit, properties: properties.join(',') || undefined };
  if (after) params.after = after;
  const r = await axios.get(`${HUB}/crm/v3/objects/${objectType}`, {
    headers: hubHeaders(token), params, timeout: 15000
  });
  return r.data;
};

router.get('/hubspot/:object', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'hubspot');
    if (!creds) return res.status(401).json({ error: 'Not connected to HubSpot' });

    const objectType = req.params.object;
    const propMap = {
      contacts: ['firstname', 'lastname', 'email', 'phone', 'company', 'city', 'country', 'createdate', 'lastmodifieddate', 'lifecyclestage'],
      deals: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate', 'hubspot_owner_id'],
      companies: ['name', 'domain', 'city', 'country', 'industry', 'numberofemployees', 'annualrevenue', 'createdate'],
    };
    const props = propMap[objectType] || [];

    let allRecords = [];
    let after = undefined;
    let pages = 0;
    const maxPages = parseInt(req.query.pages) || 3;

    do {
      const page = await hubFetch(creds.token, objectType, after, 100, props);
      const records = (page.results || []).map(r => ({
        id: r.id,
        ...Object.fromEntries(Object.entries(r.properties || {}).map(([k, v]) => [k, v]))
      }));
      allRecords = allRecords.concat(records);
      after = page.paging?.next?.after;
      pages++;
    } while (after && pages < maxPages);

    res.json({ object: objectType, count: allRecords.length, records: allRecords });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

router.post('/hubspot/import/:object', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'hubspot');
    if (!creds) return res.status(401).json({ error: 'Not connected to HubSpot' });

    const objectType = req.params.object;
    const propMap = {
      contacts: ['firstname', 'lastname', 'email', 'phone', 'company', 'city', 'country', 'createdate', 'lifecyclestage'],
      deals: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate'],
      companies: ['name', 'domain', 'city', 'country', 'industry', 'numberofemployees', 'annualrevenue'],
    };
    const props = propMap[objectType] || [];

    let allRecords = [];
    let after = undefined;
    let pages = 0;

    do {
      const page = await hubFetch(creds.token, objectType, after, 100, props);
      const records = (page.results || []).map(r => ({
        hs_id: r.id,
        ...Object.fromEntries(Object.entries(r.properties || {}).filter(([k]) => props.includes(k)).map(([k, v]) => [k, v]))
      }));
      allRecords = allRecords.concat(records);
      after = page.paging?.next?.after;
      pages++;
    } while (after && pages < 10);

    if (!allRecords.length) return res.status(400).json({ error: 'No records found in HubSpot' });

    const cols = Object.keys(allRecords[0]);
    const schema = cols.map(c => ({
      name: c,
      type: ['amount', 'numberofemployees', 'annualrevenue'].includes(c) ? 'numeric' : 'text'
    }));

    const dsName = `HubSpot ${objectType.charAt(0).toUpperCase() + objectType.slice(1)}`;
    const dsResult = await pool.query(
      'INSERT INTO datasets (name, source, row_count, column_count, schema, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [dsName, 'hubspot', allRecords.length, cols.length, JSON.stringify(schema), req.user.id]
    );
    const dsId = dsResult.rows[0].id;
    const safeCols = cols.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());
    const colDefs = safeCols.map((c, i) => `"${c}" ${schema[i].type === 'numeric' ? 'NUMERIC' : 'TEXT'}`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS "data_${dsId}" (row_index SERIAL, ${colDefs})`);

    const chunk = 100;
    for (let i = 0; i < allRecords.length; i += chunk) {
      const batch = allRecords.slice(i, i + chunk);
      const vals = batch.map((_, ri) => `(${safeCols.map((_, ci) => `$${ri * safeCols.length + ci + 1}`).join(',')})`).join(',');
      const flat = batch.flatMap(row => cols.map((c, ci) => {
        const v = row[c];
        return schema[ci].type === 'numeric' ? (isNaN(parseFloat(v)) ? null : parseFloat(v)) : (v ?? null);
      }));
      await pool.query(`INSERT INTO "data_${dsId}" (${safeCols.map(c => `"${c}"`).join(',')}) VALUES ${vals}`, flat);
    }

    res.json({ ok: true, datasetId: dsId, name: dsName, rowCount: allRecords.length, columns: cols.length });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// ── Salesforce (OAuth username-password for now) ──────────────

router.get('/salesforce/status', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'salesforce');
    res.json({ connected: !!(creds?.accessToken && creds?.instanceUrl), instanceUrl: creds?.instanceUrl || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/salesforce/connect', authenticate, async (req, res) => {
  try {
    const { username, password, securityToken, sandbox = false } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const loginUrl = sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
    const r = await axios.post(
      `${loginUrl}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: process.env.SALESFORCE_CLIENT_ID || (() => { throw new Error('SALESFORCE_CLIENT_ID env var not set') })(),
        client_secret: process.env.SALESFORCE_CLIENT_SECRET || (() => { throw new Error('SALESFORCE_CLIENT_SECRET env var not set') })(),
        username,
        password: password + (securityToken || ''),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );

    const { access_token, instance_url } = r.data;
    await pool.query(
      'INSERT INTO crm_connections (user_id, service, credentials, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, service) DO UPDATE SET credentials=$3, updated_at=NOW()',
      [req.user.id, 'salesforce', JSON.stringify({ accessToken: access_token, instanceUrl: instance_url, username })]
    );
    res.json({ ok: true, instanceUrl: instance_url, username });
  } catch (e) {
    res.status(400).json({ error: e.response?.data?.error_description || 'Salesforce authentication failed. Check credentials + security token.' });
  }
});

router.post('/salesforce/query', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'salesforce');
    if (!creds?.accessToken) return res.status(401).json({ error: 'Not connected to Salesforce' });
    const { soql } = req.body;
    if (!soql) return res.status(400).json({ error: 'soql required' });
    const r = await axios.get(
      `${creds.instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` }, timeout: 15000 }
    );
    res.json({ totalSize: r.data.totalSize, records: r.data.records?.map(rec => { const { attributes, ...rest } = rec; return rest; }) || [] });
  } catch (e) { res.status(500).json({ error: e.response?.data?.[0]?.message || e.message }); }
});

router.delete('/salesforce/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_connections WHERE user_id=$1 AND service=$2', [req.user.id, 'salesforce']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Zoho CRM ──────────────────────────────────────────────────

const ZOHO_ACCOUNTS = 'https://accounts.zoho.com';

router.get('/zoho/status', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'zoho');
    if (!creds?.accessToken) return res.json({ connected: false });
    try {
      const dc = creds.dataCenterUrl || 'https://www.zohoapis.com';
      await axios.get(`${dc}/crm/v3/Contacts?fields=Full_Name&per_page=1`, {
        headers: { Authorization: `Zoho-oauthtoken ${creds.accessToken}` }, timeout: 6000,
      });
      res.json({ connected: true, email: creds.email || null });
    } catch {
      res.json({ connected: false, expired: true });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/zoho/connect', authenticate, async (req, res) => {
  try {
    const { clientId, clientSecret, refreshToken, dataCenterUrl = 'https://www.zohoapis.com' } = req.body;
    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({ error: 'clientId, clientSecret, and refreshToken are required' });
    }
    const dc = dataCenterUrl.replace(/\/$/, '');
    const accountsDomain = dc.includes('eu') ? 'https://accounts.zoho.eu'
      : dc.includes('in') ? 'https://accounts.zoho.in'
      : dc.includes('com.au') ? 'https://accounts.zoho.com.au'
      : ZOHO_ACCOUNTS;

    const r = await axios.post(`${accountsDomain}/oauth/v2/token`, null, {
      params: { grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken },
      timeout: 10000,
    });
    const accessToken = r.data.access_token;
    if (!accessToken) return res.status(400).json({ error: 'Failed to obtain access token — check credentials' });

    // Verify by hitting Contacts
    await axios.get(`${dc}/crm/v3/Contacts?fields=Full_Name&per_page=1`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }, timeout: 8000,
    });
    await pool.query(
      'INSERT INTO crm_connections (user_id, service, credentials, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, service) DO UPDATE SET credentials=$3, updated_at=NOW()',
      [req.user.id, 'zoho', JSON.stringify({ clientId, clientSecret, refreshToken, accessToken, dataCenterUrl: dc })]
    );
    res.json({ ok: true, message: 'Connected to Zoho CRM' });
  } catch (e) {
    res.status(400).json({ error: e.response?.data?.message || e.response?.data?.error || e.message });
  }
});

router.delete('/zoho/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_connections WHERE user_id=$1 AND service=$2', [req.user.id, 'zoho']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const zohoRefresh = async (creds) => {
  const accountsDomain = (creds.dataCenterUrl || '').includes('eu') ? 'https://accounts.zoho.eu'
    : (creds.dataCenterUrl || '').includes('in') ? 'https://accounts.zoho.in'
    : ZOHO_ACCOUNTS;
  const r = await axios.post(`${accountsDomain}/oauth/v2/token`, null, {
    params: { grant_type: 'refresh_token', client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken },
    timeout: 10000,
  });
  return r.data.access_token;
};

router.get('/zoho/:module', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'zoho');
    if (!creds?.accessToken) return res.status(401).json({ error: 'Not connected to Zoho CRM' });
    const module_ = req.params.module;
    const dc = creds.dataCenterUrl || 'https://www.zohoapis.com';
    const fieldMap = {
      Contacts: 'Full_Name,Email,Phone,Mobile,Account_Name,Department,Title,Created_Time',
      Leads: 'Full_Name,Email,Phone,Company,Lead_Source,Lead_Status,Industry,Created_Time',
      Deals: 'Deal_Name,Amount,Stage,Closing_Date,Account_Name,Probability,Created_Time',
      Accounts: 'Account_Name,Website,Industry,Annual_Revenue,Employees,Phone,Billing_Country,Created_Time',
    };
    const fields = fieldMap[module_] || 'id';
    let allRecords = [];
    let page = 1;
    const maxPages = parseInt(req.query.pages) || 3;
    while (page <= maxPages) {
      const r = await axios.get(`${dc}/crm/v3/${module_}`, {
        headers: { Authorization: `Zoho-oauthtoken ${creds.accessToken}` },
        params: { fields, per_page: 200, page },
        timeout: 15000,
      });
      const data = r.data?.data || [];
      allRecords = allRecords.concat(data.map(rec => {
        const { $currency_symbol, $process_flow, $approved, $approval, ...rest } = rec;
        return rest;
      }));
      if (!r.data?.info?.more_records) break;
      page++;
    }
    res.json({ module: module_, count: allRecords.length, records: allRecords });
  } catch (e) {
    if (e.response?.status === 401) {
      try {
        const creds = await getCreds(req.user.id, 'zoho');
        const newToken = await zohoRefresh(creds);
        await pool.query(
          'UPDATE crm_connections SET credentials=$1, updated_at=NOW() WHERE user_id=$2 AND service=$3',
          [JSON.stringify({ ...creds, accessToken: newToken }), req.user.id, 'zoho']
        );
        return res.status(401).json({ error: 'Token refreshed — please retry' });
      } catch { }
    }
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

router.post('/zoho/import/:module', authenticate, async (req, res) => {
  try {
    const creds = await getCreds(req.user.id, 'zoho');
    if (!creds?.accessToken) return res.status(401).json({ error: 'Not connected to Zoho CRM' });
    const module_ = req.params.module;
    const dc = creds.dataCenterUrl || 'https://www.zohoapis.com';
    const fieldMap = {
      Contacts: 'Full_Name,Email,Phone,Account_Name,Department,Title,Created_Time',
      Leads: 'Full_Name,Email,Phone,Company,Lead_Source,Lead_Status,Industry,Created_Time',
      Deals: 'Deal_Name,Amount,Stage,Closing_Date,Account_Name,Probability,Created_Time',
      Accounts: 'Account_Name,Website,Industry,Annual_Revenue,Employees,Phone,Created_Time',
    };
    const fields = fieldMap[module_] || 'id';
    let allRecords = [];
    let page = 1;
    while (page <= 10) {
      const r = await axios.get(`${dc}/crm/v3/${module_}`, {
        headers: { Authorization: `Zoho-oauthtoken ${creds.accessToken}` },
        params: { fields, per_page: 200, page }, timeout: 20000,
      });
      const data = r.data?.data || [];
      allRecords = allRecords.concat(data);
      if (!r.data?.info?.more_records) break;
      page++;
    }
    if (!allRecords.length) return res.status(400).json({ error: `No ${module_} records found in Zoho CRM` });

    const cleaned = allRecords.map(rec => {
      const { $currency_symbol, $process_flow, $approved, $approval, id, ...rest } = rec;
      return { zoho_id: id, ...rest };
    });
    const cols = Object.keys(cleaned[0]);
    const numericCols = new Set(['Amount', 'Annual_Revenue', 'Employees', 'Probability']);
    const schema = cols.map(c => ({ name: c, type: numericCols.has(c) ? 'numeric' : 'text' }));
    const dsName = `Zoho ${module_}`;
    const dsResult = await pool.query(
      'INSERT INTO datasets (name, source, row_count, column_count, schema, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [dsName, 'zoho', cleaned.length, cols.length, JSON.stringify(schema), req.user.id]
    );
    const dsId = dsResult.rows[0].id;
    const safeCols = cols.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());
    const colDefs = safeCols.map((c, i) => `"${c}" ${schema[i].type === 'numeric' ? 'NUMERIC' : 'TEXT'}`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS "data_${dsId}" (row_index SERIAL, ${colDefs})`);
    const chunkSize = 100;
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const batch = cleaned.slice(i, i + chunkSize);
      const vals = batch.map((_, ri) => `(${safeCols.map((_, ci) => `$${ri * safeCols.length + ci + 1}`).join(',')})`).join(',');
      const flat = batch.flatMap(row => cols.map((c, ci) => {
        const v = row[c];
        return schema[ci].type === 'numeric' ? (isNaN(parseFloat(v)) ? null : parseFloat(v)) : (v != null ? String(v) : null);
      }));
      await pool.query(`INSERT INTO "data_${dsId}" (${safeCols.map(c => `"${c}"`).join(',')}) VALUES ${vals}`, flat);
    }
    res.json({ ok: true, datasetId: dsId, name: dsName, rowCount: cleaned.length, columns: cols.length });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

module.exports = router;
