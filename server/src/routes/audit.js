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

module.exports = router;
