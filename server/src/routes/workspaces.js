const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT w.*, u.name as owner_name, COUNT(wm.user_id) as member_count
       FROM workspaces w LEFT JOIN users u ON w.owner_id=u.id
       LEFT JOIN workspace_members wm ON w.id=wm.workspace_id
       WHERE w.owner_id=$1 OR w.id IN (SELECT workspace_id FROM workspace_members WHERE user_id=$1)
       GROUP BY w.id, u.name ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, plan = 'free' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    const r = await pool.query('INSERT INTO workspaces (name, slug, owner_id, plan) VALUES ($1,$2,$3,$4) RETURNING *', [name, slug, req.user.id, plan]);
    await pool.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,$3)', [r.rows[0].id, req.user.id, 'owner']);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT w.*, u.name as owner_name FROM workspaces w LEFT JOIN users u ON w.owner_id=u.id WHERE w.id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const members = await pool.query('SELECT wm.*, u.name, u.email, u.role as user_role FROM workspace_members wm JOIN users u ON wm.user_id=u.id WHERE wm.workspace_id=$1', [req.params.id]);
    res.json({ ...r.rows[0], members: members.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/members', authenticate, async (req, res) => {
  try {
    const { email, role = 'member' } = req.body;
    const user = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    const ws = await pool.query('SELECT * FROM workspaces WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!ws.rows.length) return res.status(403).json({ error: 'Only workspace owner can add members' });
    await pool.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, user.rows[0].id, role]);
    res.json({ message: 'Member added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, settings, plan } = req.body;
    const r = await pool.query('UPDATE workspaces SET name=COALESCE($1,name), plan=COALESCE($2,plan), settings=COALESCE($3,settings) WHERE id=$4 AND owner_id=$5 RETURNING *', [name, plan, settings ? JSON.stringify(settings) : null, req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not owner' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM workspaces WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not owner' });
    res.json({ message: 'Workspace deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
