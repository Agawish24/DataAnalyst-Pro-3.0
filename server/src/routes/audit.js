const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { user_id, action, resource_type, limit = 100, offset = 0 } = req.query;
    let query = `SELECT a.*, u.name as user_name, u.email as user_email FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id WHERE 1=1`;
    const params = [];
    if (user_id) { params.push(user_id); query += ` AND a.user_id=$${params.length}`; }
    if (action) { params.push(`%${action}%`); query += ` AND a.action ILIKE $${params.length}`; }
    if (resource_type) { params.push(resource_type); query += ` AND a.resource_type=$${params.length}`; }
    params.push(parseInt(limit), parseInt(offset));
    query += ` ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await pool.query(query, params);
    const count = await pool.query('SELECT COUNT(*) FROM audit_logs');
    res.json({ logs: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [byUser, byAction, recent] = await Promise.all([
      pool.query(`SELECT u.name, COUNT(*) as count FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id GROUP BY u.name ORDER BY count DESC LIMIT 10`),
      pool.query(`SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action ORDER BY count DESC LIMIT 10`),
      pool.query(`SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as count FROM audit_logs WHERE created_at > NOW()-INTERVAL '30 days' GROUP BY day ORDER BY day`),
    ]);
    res.json({ byUser: byUser.rows, byAction: byAction.rows, byDay: recent.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Anomaly Detection ─────────────────────────────────────────
router.get('/anomalies', authenticate, authorize('admin'), async (req, res) => {
  try {
    const anomalies = [];

    // Detect: unusually high activity from a single user in the last hour
    const highActivity = await pool.query(`
      SELECT u.name, u.email, COUNT(*) as event_count
      FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id
      WHERE a.created_at > NOW() - INTERVAL '1 hour'
      GROUP BY u.name, u.email
      HAVING COUNT(*) > 20
      ORDER BY event_count DESC
    `);
    highActivity.rows.forEach(r => anomalies.push({
      type: 'high_activity',
      severity: r.event_count > 50 ? 'critical' : 'warning',
      message: `${r.name || r.email} performed ${r.event_count} actions in the last hour`,
      user: r.email,
      value: r.event_count,
      threshold: 20,
      detected_at: new Date().toISOString(),
    }));

    // Detect: login failures in the last 30 min
    const loginFails = await pool.query(`
      SELECT COUNT(*) as fails FROM audit_logs
      WHERE action ILIKE '%login_fail%' AND created_at > NOW() - INTERVAL '30 minutes'
    `);
    if (parseInt(loginFails.rows[0].fails) >= 5) {
      anomalies.push({
        type: 'login_failures',
        severity: parseInt(loginFails.rows[0].fails) > 20 ? 'critical' : 'warning',
        message: `${loginFails.rows[0].fails} login failures in the last 30 minutes`,
        value: parseInt(loginFails.rows[0].fails),
        threshold: 5,
        detected_at: new Date().toISOString(),
      });
    }

    // Detect: large data exports
    const bigExports = await pool.query(`
      SELECT u.name, u.email, COUNT(*) as export_count
      FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id
      WHERE a.action ILIKE '%export%' AND a.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY u.name, u.email
      HAVING COUNT(*) > 10
    `);
    bigExports.rows.forEach(r => anomalies.push({
      type: 'excessive_exports',
      severity: 'warning',
      message: `${r.name || r.email} exported data ${r.export_count} times in 24 hours`,
      user: r.email,
      value: r.export_count,
      threshold: 10,
      detected_at: new Date().toISOString(),
    }));

    // Detect: unusual off-hours access (midnight–5am)
    const offHours = await pool.query(`
      SELECT u.name, u.email, COUNT(*) as count
      FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id
      WHERE EXTRACT(HOUR FROM a.created_at) BETWEEN 0 AND 4
        AND a.created_at > NOW() - INTERVAL '7 days'
      GROUP BY u.name, u.email
      HAVING COUNT(*) > 5
    `);
    offHours.rows.forEach(r => anomalies.push({
      type: 'off_hours_access',
      severity: 'info',
      message: `${r.name || r.email} had ${r.count} events between midnight and 5am in the last 7 days`,
      user: r.email,
      value: r.count,
      threshold: 5,
      detected_at: new Date().toISOString(),
    }));

    res.json({ anomalies, scanned_at: new Date().toISOString(), total: anomalies.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Compliance Checks ─────────────────────────────────────────
router.get('/compliance', authenticate, authorize('admin'), async (req, res) => {
  try {
    const checks = [];

    // Check 1: 2FA adoption
    const [totalUsers, tfaEnabled] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users`),
      pool.query(`SELECT COUNT(DISTINCT user_id) FROM tfa_secrets WHERE enabled=true`),
    ]);
    const tfaPct = Math.round((parseInt(tfaEnabled.rows[0].count) / Math.max(1, parseInt(totalUsers.rows[0].count))) * 100);
    checks.push({
      id: 'tfa_adoption',
      category: 'Security',
      title: '2FA Adoption Rate',
      status: tfaPct >= 80 ? 'pass' : tfaPct >= 50 ? 'warning' : 'fail',
      value: `${tfaPct}% (${tfaEnabled.rows[0].count}/${totalUsers.rows[0].count} users)`,
      recommendation: tfaPct < 80 ? 'Enforce 2FA for all users with admin or analyst roles' : null,
    });

    // Check 2: PII masking coverage
    const [maskRules, datasets] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT dataset_id) FROM masking_rules`),
      pool.query(`SELECT COUNT(*) FROM datasets`),
    ]);
    const maskPct = Math.round((parseInt(maskRules.rows[0].count) / Math.max(1, parseInt(datasets.rows[0].count))) * 100);
    checks.push({
      id: 'pii_masking',
      category: 'Privacy',
      title: 'PII Masking Coverage',
      status: maskPct >= 60 ? 'pass' : maskPct >= 30 ? 'warning' : 'fail',
      value: `${maskPct}% of datasets have masking rules (${maskRules.rows[0].count}/${datasets.rows[0].count})`,
      recommendation: maskPct < 60 ? 'Apply masking rules to all datasets containing PII columns (email, phone, name, SSN)' : null,
    });

    // Check 3: Audit log retention
    const oldestLog = await pool.query(`SELECT MIN(created_at) as oldest FROM audit_logs`);
    const oldestDate = oldestLog.rows[0]?.oldest;
    const retentionDays = oldestDate ? Math.floor((Date.now() - new Date(oldestDate)) / 86400000) : 0;
    checks.push({
      id: 'audit_retention',
      category: 'Compliance',
      title: 'Audit Log Retention',
      status: retentionDays >= 90 ? 'pass' : retentionDays >= 30 ? 'warning' : 'fail',
      value: retentionDays > 0 ? `${retentionDays} days of logs retained` : 'No audit logs found',
      recommendation: retentionDays < 90 ? 'Maintain at least 90 days of audit logs for SOC2/GDPR compliance' : null,
    });

    // Check 4: API key rotation
    const staleKeys = await pool.query(`
      SELECT COUNT(*) FROM api_keys WHERE created_at < NOW() - INTERVAL '90 days' AND is_active=true
    `);
    const staleCount = parseInt(staleKeys.rows[0].count);
    checks.push({
      id: 'api_key_rotation',
      category: 'Security',
      title: 'API Key Rotation',
      status: staleCount === 0 ? 'pass' : staleCount <= 2 ? 'warning' : 'fail',
      value: staleCount === 0 ? 'All API keys rotated within 90 days' : `${staleCount} API key(s) older than 90 days`,
      recommendation: staleCount > 0 ? 'Rotate or revoke API keys older than 90 days' : null,
    });

    // Check 5: Data lineage coverage
    const [lineageTracked, dsTotal] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT node_id) FROM lineage_nodes WHERE node_type='dataset'`),
      pool.query(`SELECT COUNT(*) FROM datasets`),
    ]);
    const lineagePct = Math.round((parseInt(lineageTracked.rows[0].count) / Math.max(1, parseInt(dsTotal.rows[0].count))) * 100);
    checks.push({
      id: 'data_lineage',
      category: 'Governance',
      title: 'Data Lineage Coverage',
      status: lineagePct >= 70 ? 'pass' : lineagePct >= 40 ? 'warning' : 'fail',
      value: `${lineagePct}% of datasets have lineage tracking`,
      recommendation: lineagePct < 70 ? 'Enable lineage tracking for all production datasets' : null,
    });

    const passed = checks.filter(c => c.status === 'pass').length;
    const score = Math.round((passed / checks.length) * 100);
    res.json({ checks, score, passed, total: checks.length, assessed_at: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Log a new audit event (internal helper used by other routes) ──
router.post('/log', authenticate, async (req, res) => {
  try {
    const { action, resource_type, resource_id, details } = req.body;
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, action, resource_type, resource_id, JSON.stringify(details || {}), req.ip]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
