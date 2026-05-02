const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT w.*, d.name as dataset_name FROM webhooks w LEFT JOIN datasets d ON w.dataset_id=d.id WHERE w.created_by=$1 ORDER BY w.created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, url, dataset_id, metric_col, operator, threshold_value, method = 'POST', headers = {}, payload_template } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    const r = await pool.query(
      'INSERT INTO webhooks (name, url, dataset_id, metric_col, operator, threshold_value, method, headers, payload_template, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [name, url, dataset_id || null, metric_col || null, operator || null, threshold_value || null, method, JSON.stringify(headers), payload_template || null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/test', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM webhooks WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const wh = r.rows[0];
    const payload = { event: 'test', webhook: wh.name, timestamp: new Date().toISOString(), message: 'Test trigger from Data Analysis Suite' };
    try {
      const resp = await axios({ method: wh.method || 'POST', url: wh.url, headers: { 'Content-Type': 'application/json', ...wh.headers }, data: payload, timeout: 10000 });
      await pool.query('INSERT INTO alert_history (webhook_id, triggered_value, status, response_code) VALUES ($1,$2,$3,$4)', [wh.id, null, 'test_ok', resp.status]);
      res.json({ ok: true, status: resp.status, message: 'Webhook triggered successfully' });
    } catch (e) {
      await pool.query('INSERT INTO alert_history (webhook_id, status, response_code) VALUES ($1,$2,$3)', [wh.id, 'test_failed', e.response?.status || 0]);
      res.json({ ok: false, error: e.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/trigger', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM webhooks WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const wh = r.rows[0];
    if (!wh.is_active) return res.status(400).json({ error: 'Webhook is disabled' });

    let currentValue = null;
    let conditionMet = false;
    if (wh.dataset_id && wh.metric_col && wh.operator && wh.threshold_value !== null) {
      const agg = await pool.query(`SELECT AVG("${wh.metric_col}") as val FROM data_${wh.dataset_id}`).catch(() => null);
      currentValue = parseFloat(agg?.rows[0]?.val || 0);
      const ops = { '>': (a,b) => a>b, '<': (a,b) => a<b, '>=': (a,b) => a>=b, '<=': (a,b) => a<=b, '=': (a,b) => a===b };
      conditionMet = ops[wh.operator]?.(currentValue, parseFloat(wh.threshold_value)) ?? true;
    } else { conditionMet = true; }

    if (!conditionMet) return res.json({ triggered: false, reason: `Condition not met: ${currentValue} ${wh.operator} ${wh.threshold_value}` });

    const payload = wh.payload_template
      ? JSON.parse(wh.payload_template.replace('{{value}}', currentValue).replace('{{threshold}}', wh.threshold_value).replace('{{metric}}', wh.metric_col).replace('{{timestamp}}', new Date().toISOString()))
      : { event: 'threshold_alert', metric: wh.metric_col, current_value: currentValue, threshold: wh.threshold_value, operator: wh.operator, webhook_name: wh.name, timestamp: new Date().toISOString() };

    try {
      const resp = await axios({ method: wh.method, url: wh.url, headers: { 'Content-Type': 'application/json', ...wh.headers }, data: payload, timeout: 10000 });
      await pool.query('UPDATE webhooks SET last_triggered=NOW(), trigger_count=trigger_count+1 WHERE id=$1', [wh.id]);
      await pool.query('INSERT INTO alert_history (webhook_id, triggered_value, status, response_code) VALUES ($1,$2,$3,$4)', [wh.id, currentValue, 'ok', resp.status]);
      res.json({ triggered: true, currentValue, payload });
    } catch (e) {
      await pool.query('INSERT INTO alert_history (webhook_id, triggered_value, status, response_code) VALUES ($1,$2,$3,$4)', [wh.id, currentValue, 'failed', e.response?.status || 0]);
      res.json({ triggered: false, error: e.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, url, is_active, metric_col, operator, threshold_value } = req.body;
    const r = await pool.query('UPDATE webhooks SET name=COALESCE($1,name), url=COALESCE($2,url), is_active=COALESCE($3,is_active), metric_col=COALESCE($4,metric_col), operator=COALESCE($5,operator), threshold_value=COALESCE($6,threshold_value) WHERE id=$7 AND created_by=$8 RETURNING *', [name, url, is_active, metric_col, operator, threshold_value, req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM alert_history WHERE webhook_id=$1 ORDER BY triggered_at DESC LIMIT 50', [req.params.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM webhooks WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Webhook deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
