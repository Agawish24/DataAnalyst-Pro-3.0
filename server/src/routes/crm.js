const express = require('express');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const HUB = 'https://api.hubapi.com';

const getCreds = async (userId, provider) => {
  const r = await pool.query('SELECT credentials FROM crm_connections WHERE user_id=$1 AND provider=$2', [userId, provider]);
  return r.rows[0]?.credentials || null;
};

const hubHeaders = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

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
      'INSERT INTO crm_connections (user_id, provider, credentials, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, provider) DO UPDATE SET credentials=$3, updated_at=NOW()',
      [req.user.id, 'hubspot', JSON.stringify({ token })]
    );
    res.json({ ok: true, message: 'Connected to HubSpot' });
  } catch (e) {
    res.status(400).json({ error: e.response?.status === 401 ? 'Invalid HubSpot token' : e.response?.data?.message || e.message });
  }
});

router.delete('/hubspot/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_connections WHERE user_id=$1 AND provider=$2', [req.user.id, 'hubspot']);
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
        client_id: '3MVG9YDQS5WtC11peRwN9gKxF.W7M_V0tWJ4x0TIqF4C7pnzr3HFD8Sj3WmhKDxYcr.gKzG0A_Yt5K4qL5TS',
        client_secret: '1234567890ABCDEF',
        username,
        password: password + (securityToken || ''),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );

    const { access_token, instance_url } = r.data;
    await pool.query(
      'INSERT INTO crm_connections (user_id, provider, credentials, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, provider) DO UPDATE SET credentials=$3, updated_at=NOW()',
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
    await pool.query('DELETE FROM crm_connections WHERE user_id=$1 AND provider=$2', [req.user.id, 'salesforce']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
