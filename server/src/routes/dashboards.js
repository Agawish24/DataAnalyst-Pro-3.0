const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name as creator_name FROM dashboards d LEFT JOIN users u ON d.created_by=u.id
       WHERE d.created_by=$1 OR d.is_public=true ORDER BY d.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description = '', layout = [], widgets = [], config, is_public = false } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const configVal = config || { layout, widgets };
    const result = await pool.query(
      'INSERT INTO dashboards (name, description, config, created_by, is_public) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, description, JSON.stringify(configVal), req.user.id, is_public]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT d.*, u.name as creator_name FROM dashboards d LEFT JOIN users u ON d.created_by=u.id WHERE d.id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const dash = result.rows[0];
    if (!dash.is_public && dash.created_by !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    res.json(dash);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, layout, widgets, config, is_public } = req.body;
    const dash = await pool.query('SELECT * FROM dashboards WHERE id=$1', [req.params.id]);
    if (!dash.rows.length) return res.status(404).json({ error: 'Not found' });
    if (dash.rows[0].created_by !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const configVal = config || (layout !== undefined || widgets !== undefined ? { layout: layout || [], widgets: widgets || [] } : null);
    const result = await pool.query(
      `UPDATE dashboards SET name=COALESCE($1,name), description=COALESCE($2,description),
       config=COALESCE($3,config), is_public=COALESCE($4,is_public), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name, description, configVal ? JSON.stringify(configVal) : null, is_public, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const dash = await pool.query('SELECT * FROM dashboards WHERE id=$1', [req.params.id]);
    if (!dash.rows.length) return res.status(404).json({ error: 'Not found' });
    if (dash.rows[0].created_by !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM dashboards WHERE id=$1', [req.params.id]);
    res.json({ message: 'Dashboard deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
