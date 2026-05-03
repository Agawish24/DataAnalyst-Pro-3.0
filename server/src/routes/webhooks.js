const express = require('express');
const https = require('https');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

// ── Groq AI narrative ────────────────────────────────────────────────────────
const groqChat = (messages) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: 350, temperature: 0.35 });
  const req = https.request({
    hostname: 'api.groq.com', port: 443, path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse')); } });
  });
  req.on('error', reject); req.write(body); req.end();
});

const buildAlertNarrative = async (wh, rules, ruleResults, datasetName) => {
  const firedRules = ruleResults.filter(r => r.conditionMet);
  const fallback = `Alert "${wh.name}" fired on ${datasetName}. ` +
    firedRules.map(r => `${r.metric} (${r.agg_fn || 'avg'}) = ${r.currentValue?.toFixed(2)} ${r.operator} ${r.threshold_value}`).join('; ') + '.';

  if (!process.env.GROQ_API_KEY || !firedRules.length) return fallback;
  try {
    const ruleDesc = firedRules.map(r =>
      `${r.agg_fn || 'AVG'}(${r.metric}) = ${r.currentValue?.toFixed(2)} which is ${r.operator} threshold ${r.threshold_value} (severity: ${r.severity || 'medium'})`
    ).join('; ');
    const r = await groqChat([
      { role: 'system', content: 'You explain data alerts to business users in 1-2 sentences. Be specific about values, what the threshold is, and one action to take. No markdown.' },
      { role: 'user', content: `Alert: "${wh.name}" on dataset "${datasetName}". Rule(s) fired: ${ruleDesc}. Explain what happened and suggest one immediate action.` }
    ]);
    return r?.choices?.[0]?.message?.content || fallback;
  } catch { return fallback; }
};

// ── Write lineage event ──────────────────────────────────────────────────────
const writeLineage = async (datasetId, eventType, actor, metadata) => {
  if (!datasetId) return;
  try {
    await pool.query(
      `INSERT INTO lineage (dataset_id, event_type, actor, metadata) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [datasetId, eventType, actor, JSON.stringify(metadata)]
    );
  } catch { /* lineage table may not exist */ }
};

// ── Write audit trail entry ──────────────────────────────────────────────────
const writeAudit = async (webhookId, action, userId, metadata) => {
  try {
    await pool.query(
      `INSERT INTO alert_history (webhook_id, triggered_value, status, response_code, narrative, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [webhookId, metadata?.currentValue ?? null, action, 200, metadata?.narrative || null, JSON.stringify(metadata || {})]
    ).catch(async () => {
      // Fallback if narrative/metadata columns don't exist
      await pool.query(
        `INSERT INTO alert_history (webhook_id, triggered_value, status, response_code) VALUES ($1,$2,$3,$4)`,
        [webhookId, metadata?.currentValue ?? null, action, 200]
      );
    });
  } catch { /* ignore */ }
};

// ── Evaluate a single rule against dataset aggregate ───────────────────────
const evaluateRule = async (rule, datasetId) => {
  const { metric_col, operator, threshold_value, agg_fn = 'AVG', time_window_hours } = rule;
  if (!metric_col || !operator || threshold_value === undefined || threshold_value === null) return null;

  let query;
  const col = `"${metric_col}"`;
  if (time_window_hours) {
    // Requires a date/timestamp column — look for common patterns
    query = `SELECT ${agg_fn}(${col}) as val FROM data_${datasetId}`;
  } else {
    query = `SELECT ${agg_fn}(${col}) as val FROM data_${datasetId}`;
  }

  const agg = await pool.query(query).catch(() => null);
  const currentValue = parseFloat(agg?.rows[0]?.val ?? 0);
  const thresh = parseFloat(threshold_value);
  const ops = { '>': (a,b) => a>b, '<': (a,b) => a<b, '>=': (a,b) => a>=b, '<=': (a,b) => a<=b, '=': (a,b) => Math.abs(a-b)<0.0001, '!=': (a,b) => Math.abs(a-b)>=0.0001 };
  const conditionMet = ops[operator]?.(currentValue, thresh) ?? false;

  return { ...rule, currentValue, conditionMet, operator, threshold_value: thresh, metric: metric_col };
};

// ── Evaluate all rules with AND/OR logic ────────────────────────────────────
const evaluateAllRules = async (wh) => {
  const rules = wh.rules || [];
  // Backwards compat: if no rules array but has metric_col, synthesise one
  if (!rules.length && wh.metric_col) {
    rules.push({ metric_col: wh.metric_col, operator: wh.operator || '>', threshold_value: wh.threshold_value, agg_fn: 'AVG', severity: 'medium' });
  }
  if (!rules.length) return { conditionMet: true, ruleResults: [] };

  const ruleResults = await Promise.all(rules.map(r => evaluateRule(r, wh.dataset_id)));
  const validResults = ruleResults.filter(Boolean);

  const logic = wh.rule_logic || 'OR'; // 'AND' | 'OR'
  const conditionMet = logic === 'AND'
    ? validResults.every(r => r.conditionMet)
    : validResults.some(r => r.conditionMet);

  return { conditionMet, ruleResults: validResults };
};

// ── Rate limiting check ──────────────────────────────────────────────────────
const isRateLimited = (wh) => {
  if (!wh.last_triggered || !wh.min_interval_minutes) return false;
  const elapsed = (Date.now() - new Date(wh.last_triggered).getTime()) / 60000;
  return elapsed < parseFloat(wh.min_interval_minutes);
};

// ════════════════════════════════════════════════════════════════════════════
// CRUD
// ════════════════════════════════════════════════════════════════════════════
router.get('/', authenticate, async (req, res) => {
  try {
    // Own webhooks + shared ones
    const r = await pool.query(
      `SELECT w.*, d.name as dataset_name
       FROM webhooks w LEFT JOIN datasets d ON w.dataset_id=d.id
       WHERE w.created_by=$1 OR w.shared=true
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const {
      name, url, dataset_id, metric_col, operator, threshold_value,
      method = 'POST', headers = {}, payload_template,
      rules = [], rule_logic = 'OR',
      severity = 'medium', channel = 'webhook', channel_config = {},
      shared = false, min_interval_minutes = null,
    } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });

    // Build rules array — support both legacy single-rule and new multi-rule
    let finalRules = rules;
    if (!finalRules.length && metric_col) {
      finalRules = [{ metric_col, operator: operator || '>', threshold_value, agg_fn: 'AVG', severity, label: name }];
    }

    let r;
    try {
      r = await pool.query(
        `INSERT INTO webhooks
           (name, url, dataset_id, metric_col, operator, threshold_value, method, headers, payload_template,
            rules, rule_logic, severity, channel, channel_config, shared, min_interval_minutes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [name, url, dataset_id || null, metric_col || null, operator || null, threshold_value || null,
         method, JSON.stringify(headers), payload_template || null,
         JSON.stringify(finalRules), rule_logic, severity, channel, JSON.stringify(channel_config),
         shared, min_interval_minutes, req.user.id]
      );
    } catch {
      // Fallback: columns not yet migrated
      r = await pool.query(
        `INSERT INTO webhooks (name, url, dataset_id, metric_col, operator, threshold_value, method, headers, payload_template, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [name, url, dataset_id || null, metric_col || null, operator || null, threshold_value || null,
         method, JSON.stringify(headers), payload_template || null, req.user.id]
      );
    }
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, url, is_active, metric_col, operator, threshold_value, rules, rule_logic, severity, shared, min_interval_minutes, channel, channel_config } = req.body;
    const r = await pool.query(
      `UPDATE webhooks SET
         name=COALESCE($1,name), url=COALESCE($2,url), is_active=COALESCE($3,is_active),
         metric_col=COALESCE($4,metric_col), operator=COALESCE($5,operator),
         threshold_value=COALESCE($6,threshold_value), updated_at=NOW()
       WHERE id=$7 AND created_by=$8 RETURNING *`,
      [name, url, is_active, metric_col, operator, threshold_value, req.params.id, req.user.id]
    );
    // Try extended columns
    try {
      await pool.query(
        `UPDATE webhooks SET
           rules=COALESCE($1,rules), rule_logic=COALESCE($2,rule_logic),
           severity=COALESCE($3,severity), shared=COALESCE($4,shared),
           min_interval_minutes=COALESCE($5,min_interval_minutes),
           channel=COALESCE($6,channel), channel_config=COALESCE($7,channel_config)
         WHERE id=$8`,
        [rules ? JSON.stringify(rules) : null, rule_logic || null, severity || null,
         shared ?? null, min_interval_minutes ?? null,
         channel || null, channel_config ? JSON.stringify(channel_config) : null,
         req.params.id]
      );
    } catch { /* extended cols not available */ }
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM webhooks WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Webhook deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// Test — always fires without condition check
// ════════════════════════════════════════════════════════════════════════════
router.post('/:id/test', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM webhooks WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const wh = r.rows[0];
    const payload = { event: 'test', webhook: wh.name, timestamp: new Date().toISOString(), message: 'Test trigger from DataAnalyst Pro' };
    try {
      const resp = await axios({ method: wh.method || 'POST', url: wh.url, headers: { 'Content-Type': 'application/json', ...(wh.headers || {}) }, data: payload, timeout: 10000 });
      await writeAudit(wh.id, 'test_ok', req.user.id, { status: resp.status });
      res.json({ ok: true, status: resp.status });
    } catch (e) {
      await writeAudit(wh.id, 'test_failed', req.user.id, { error: e.message });
      res.json({ ok: false, error: e.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// Trigger — full rule engine evaluation with AI narrative + governance
// ════════════════════════════════════════════════════════════════════════════
router.post('/:id/trigger', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM webhooks WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const wh = r.rows[0];
    if (!wh.is_active) return res.status(400).json({ error: 'Webhook is disabled' });

    // ── Rate limit check ─────────────────────────────────────────────
    if (isRateLimited(wh)) {
      const remaining = parseFloat(wh.min_interval_minutes) - (Date.now() - new Date(wh.last_triggered).getTime()) / 60000;
      return res.json({ triggered: false, reason: `Rate limited — wait ${remaining.toFixed(1)} more minute(s)` });
    }

    // ── Evaluate all rules ───────────────────────────────────────────
    const { conditionMet, ruleResults } = await evaluateAllRules(wh);
    if (!conditionMet) {
      const summary = ruleResults.map(r => `${r.metric} = ${r.currentValue?.toFixed(2)} (threshold: ${r.operator} ${r.threshold_value})`).join('; ');
      return res.json({ triggered: false, reason: `Condition not met: ${summary}`, ruleResults });
    }

    const triggeredAt = new Date().toISOString();
    const metaResult = await pool.query('SELECT name FROM datasets WHERE id=$1', [wh.dataset_id]).catch(() => ({ rows: [] }));
    const datasetName = metaResult.rows[0]?.name || 'unknown dataset';

    // ── AI narrative + payload in parallel ──────────────────────────
    const [narrative] = await Promise.all([
      buildAlertNarrative(wh, wh.rules || [], ruleResults, datasetName),
    ]);

    const governance = {
      webhook_name: wh.name,
      dataset_name: datasetName,
      dataset_version: '1.0',
      triggered_at: triggeredAt,
      triggered_at_display: new Date(triggeredAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
      rules_fired: ruleResults.filter(r => r.conditionMet).length,
      rule_logic: wh.rule_logic || 'OR',
      severity: wh.severity || 'medium',
    };

    // Build outbound payload
    const firedRule = ruleResults.find(r => r.conditionMet) || ruleResults[0] || {};
    const currentValue = firedRule.currentValue ?? null;
    const payload = wh.payload_template
      ? (() => { try { return JSON.parse(wh.payload_template.replace('{{value}}', currentValue).replace('{{threshold}}', firedRule.threshold_value).replace('{{metric}}', firedRule.metric).replace('{{timestamp}}', triggeredAt).replace('{{narrative}}', narrative)); } catch { return {}; } })()
      : { event: 'threshold_alert', webhook_name: wh.name, dataset: datasetName, rules_fired: governance.rules_fired, rule_results: ruleResults.filter(r => r.conditionMet).map(r => ({ metric: r.metric, value: r.currentValue, operator: r.operator, threshold: r.threshold_value })), narrative, severity: wh.severity || 'medium', timestamp: triggeredAt, governance };

    // ── Dispatch webhook ─────────────────────────────────────────────
    let dispatchOk = false, responseStatus = 0;
    try {
      const resp = await axios({ method: wh.method || 'POST', url: wh.url, headers: { 'Content-Type': 'application/json', ...(wh.headers || {}) }, data: payload, timeout: 12000 });
      dispatchOk = true; responseStatus = resp.status;
    } catch (e) { responseStatus = e.response?.status || 0; }

    // ── Persist: update webhook + write history + lineage in parallel ─
    await Promise.all([
      pool.query('UPDATE webhooks SET last_triggered=NOW(), trigger_count=trigger_count+1 WHERE id=$1', [wh.id]),
      writeAudit(wh.id, dispatchOk ? 'triggered' : 'trigger_failed', req.user.id, { currentValue, narrative, governance, responseStatus }),
      writeLineage(wh.dataset_id, 'alert_triggered', `user:${req.user.id}`, {
        webhook_name: wh.name, severity: wh.severity, rules_fired: governance.rules_fired,
        rule_summary: ruleResults.filter(r => r.conditionMet).map(r => `${r.metric} ${r.operator} ${r.threshold_value}`).join(' AND '),
        triggered_at: triggeredAt, dataset_name: datasetName,
      }),
    ]);

    res.json({ triggered: dispatchOk, currentValue, ruleResults, narrative, governance, payload });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// History / audit trail
// ════════════════════════════════════════════════════════════════════════════
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    let r;
    try {
      r = await pool.query(
        `SELECT id, triggered_value, status, response_code, narrative, metadata, triggered_at
         FROM alert_history WHERE webhook_id=$1 ORDER BY triggered_at DESC LIMIT 50`,
        [req.params.id]
      );
    } catch {
      r = await pool.query(
        `SELECT * FROM alert_history WHERE webhook_id=$1 ORDER BY triggered_at DESC LIMIT 50`,
        [req.params.id]
      );
    }
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// Evaluate rules without triggering (dry-run)
// ════════════════════════════════════════════════════════════════════════════
router.post('/:id/evaluate', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM webhooks WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const wh = r.rows[0];
    const { conditionMet, ruleResults } = await evaluateAllRules(wh);
    const metaResult = await pool.query('SELECT name FROM datasets WHERE id=$1', [wh.dataset_id]).catch(() => ({ rows: [] }));
    const datasetName = metaResult.rows[0]?.name || 'unknown dataset';

    let narrative = null;
    if (conditionMet) {
      narrative = await buildAlertNarrative(wh, wh.rules || [], ruleResults, datasetName);
    }

    res.json({ conditionMet, ruleResults, narrative, datasetName, evaluated_at: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
