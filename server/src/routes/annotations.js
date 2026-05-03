const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET / with ?dataset_id=N query param
router.get('/', authenticate, async (req, res) => {
  const { dataset_id, target_type, target_ref } = req.query;
  if (!dataset_id) return res.status(400).json({ error: 'dataset_id query param required' });
  try {
    let q = `SELECT a.*, u.name as author_name FROM annotations a JOIN users u ON a.user_id = u.id WHERE a.dataset_id = $1`;
    const params = [dataset_id];
    if (target_type) { q += ` AND a.annotation_type = $${params.length + 1}`; params.push(target_type); }
    if (target_ref)  { q += ` AND a.column_name = $${params.length + 1}`; params.push(target_ref); }
    q += ' ORDER BY a.created_at DESC';
    const r = await pool.query(q, params);
    res.json(r.rows.map(row => ({ ...row, target_type: row.annotation_type || 'dataset', target_ref: row.column_name || null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST / with dataset_id in body
router.post('/', authenticate, async (req, res) => {
  const { dataset_id, target_type, target_ref, content } = req.body;
  if (!dataset_id) return res.status(400).json({ error: 'dataset_id required' });
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    const r = await pool.query(
      `INSERT INTO annotations (dataset_id, annotation_type, column_name, content, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [dataset_id, target_type || 'dataset', target_ref || null, content, req.user.id]
    );
    const withAuthor = await pool.query(
      `SELECT a.*, u.name as author_name FROM annotations a JOIN users u ON a.user_id = u.id WHERE a.id = $1`,
      [r.rows[0].id]
    );
    const row = withAuthor.rows[0];
    res.status(201).json({ ...row, target_type: row.annotation_type || 'dataset', target_ref: row.column_name || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:datasetId', authenticate, async (req, res) => {
  try {
    const { target_type, target_ref } = req.query;
    let q = `SELECT a.*, u.name as author_name
             FROM annotations a
             JOIN users u ON a.user_id = u.id
             WHERE a.dataset_id = $1`;
    const params = [req.params.datasetId];
    if (target_type) { q += ` AND a.annotation_type = $${params.length + 1}`; params.push(target_type); }
    if (target_ref)  { q += ` AND a.column_name = $${params.length + 1}`; params.push(target_ref); }
    q += ' ORDER BY a.created_at DESC';
    const r = await pool.query(q, params);
    // Normalize field names to match what the frontend expects
    const rows = r.rows.map(row => ({
      ...row,
      target_type: row.annotation_type || 'dataset',
      target_ref:  row.column_name || null,
      content:     row.content,
    }));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:datasetId', authenticate, async (req, res) => {
  try {
    const { target_type, target_ref, content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const r = await pool.query(
      `INSERT INTO annotations (dataset_id, annotation_type, column_name, content, user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.datasetId, target_type || 'dataset', target_ref || null, content, req.user.id]
    );
    const withAuthor = await pool.query(
      `SELECT a.*, u.name as author_name FROM annotations a
       JOIN users u ON a.user_id = u.id WHERE a.id = $1`,
      [r.rows[0].id]
    );
    const row = withAuthor.rows[0];
    res.status(201).json({
      ...row,
      target_type: row.annotation_type || 'dataset',
      target_ref:  row.column_name || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    const r = await pool.query(
      'UPDATE annotations SET content = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [content, req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not author' });
    res.json({ ...r.rows[0], target_type: r.rows[0].annotation_type, target_ref: r.rows[0].column_name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM annotations WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(403).json({ error: 'Not authorized' });
    res.json({ message: 'Annotation deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
