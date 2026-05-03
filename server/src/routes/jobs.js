const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Jobs CRUD
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT j.*, d.name as dataset_name, u.name as creator_name FROM jobs j
       LEFT JOIN datasets d ON j.dataset_id=d.id LEFT JOIN users u ON j.created_by=u.id
       WHERE j.created_by=$1 ORDER BY j.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, job_type, type: jobTypeAlias, config = {}, schedule_cron, schedule_description, dataset_id } = req.body;
    const finalJobType = job_type || jobTypeAlias;
    if (!name || !finalJobType) return res.status(400).json({ error: 'Name and job_type required' });
    const result = await pool.query(
      'INSERT INTO jobs (name, job_type, config, schedule_cron, schedule_description, dataset_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, finalJobType, JSON.stringify(config), schedule_cron, schedule_description, dataset_id || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, config, schedule_cron, schedule_description, status } = req.body;
    const result = await pool.query(
      `UPDATE jobs SET name=COALESCE($1,name), config=COALESCE($2,config), schedule_cron=COALESCE($3,schedule_cron),
       schedule_description=COALESCE($4,schedule_description), status=COALESCE($5,status), updated_at=NOW()
       WHERE id=$6 AND created_by=$7 RETURNING *`,
      [name, config ? JSON.stringify(config) : null, schedule_cron, schedule_description, status, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM jobs WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Run a job immediately
router.post('/:id/run', authenticate, async (req, res) => {
  try {
    const job = await pool.query('SELECT * FROM jobs WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!job.rows.length) return res.status(404).json({ error: 'Job not found' });
    const j = job.rows[0];

    const runRes = await pool.query('INSERT INTO job_runs (job_id, status) VALUES ($1,$2) RETURNING *', [j.id, 'running']);
    const runId = runRes.rows[0].id;

    let result = {}, error = null;
    try {
      if (j.job_type === 'profile' && j.dataset_id) {
        const { generateProfile } = require('./profiling');
        const profile = await generateProfile(j.dataset_id);
        await pool.query('DELETE FROM data_profiles WHERE dataset_id=$1', [j.dataset_id]);
        await pool.query('INSERT INTO data_profiles (dataset_id, profile_data) VALUES ($1,$2)', [j.dataset_id, JSON.stringify(profile)]);
        result = { message: 'Profile generated', rows: profile?.overview?.rowCount };
      } else if (j.job_type === 'sql_query' && j.config?.sql) {
        const qr = await pool.query(j.config.sql);
        result = { rows: qr.rowCount, columns: qr.fields?.map(f=>f.name) };
      } else {
        result = { message: `Job type '${j.job_type}' executed` };
      }
    } catch (e) { error = e.message; }

    await pool.query(
      'UPDATE job_runs SET status=$1, finished_at=NOW(), result=$2, error_message=$3 WHERE id=$4',
      [error ? 'failed' : 'success', JSON.stringify(result), error, runId]
    );
    await pool.query('UPDATE jobs SET last_run_at=NOW(), last_result=$1 WHERE id=$2', [JSON.stringify(result), j.id]);
    res.json({ run_id: runId, status: error ? 'failed' : 'success', result, error });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/runs', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM job_runs WHERE job_id=$1 ORDER BY started_at DESC LIMIT 20', [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alerts CRUD
router.get('/alerts/list', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, d.name as dataset_name FROM alerts a LEFT JOIN datasets d ON a.dataset_id=d.id WHERE a.created_by=$1 ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/alerts', authenticate, async (req, res) => {
  try {
    const { name, dataset_id, condition_sql, threshold_value, comparison_operator = '>', notification_channel = 'in_app', notification_config = {} } = req.body;
    const result = await pool.query(
      'INSERT INTO alerts (name, dataset_id, condition_sql, threshold_value, comparison_operator, notification_channel, notification_config, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, dataset_id, condition_sql, threshold_value, comparison_operator, notification_channel, JSON.stringify(notification_config), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/alerts/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM alerts WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Alert deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check all alerts for a dataset
router.post('/alerts/check/:datasetId', authenticate, async (req, res) => {
  try {
    const alerts = await pool.query('SELECT * FROM alerts WHERE dataset_id=$1 AND is_active=true', [req.params.datasetId]);
    const triggered = [];
    for (const alert of alerts.rows) {
      try {
        const sql = alert.condition_sql.replace(/\bfrom\s+dataset\b/gi, `FROM data_${req.params.datasetId}`);
        const r = await pool.query(sql);
        const val = parseFloat(Object.values(r.rows[0] || {})[0]);
        let isTriggered = false;
        if (alert.comparison_operator === '>' && val > alert.threshold_value) isTriggered = true;
        if (alert.comparison_operator === '<' && val < alert.threshold_value) isTriggered = true;
        if (alert.comparison_operator === '>=' && val >= alert.threshold_value) isTriggered = true;
        if (alert.comparison_operator === '<=' && val <= alert.threshold_value) isTriggered = true;
        if (alert.comparison_operator === '=' && val == alert.threshold_value) isTriggered = true;
        if (isTriggered) {
          triggered.push({ alert, triggeredValue: val });
          await pool.query('INSERT INTO alert_triggers (alert_id, triggered_value) VALUES ($1,$2)', [alert.id, val]);
          await pool.query('UPDATE alerts SET last_triggered_at=NOW() WHERE id=$1', [alert.id]);
        }
      } catch { /* skip failed checks */ }
    }
    res.json({ checked: alerts.rows.length, triggered: triggered.length, details: triggered });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
