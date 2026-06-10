const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /activity — recent collaboration activity across all datasets
router.get('/activity', authenticate, async (req, res) => {
  try {
    const comments = await pool.query(
      `SELECT c.id, c.content, c.created_at, c.target_type, c.target_id,
              u.name as user_name, u.role as user_role, 'comment' as activity_type
       FROM comments c LEFT JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC LIMIT 20`
    );
    const shares = await pool.query(
      `SELECT id, resource_type, resource_id, shared_with_email, permission_level,
              created_at, 'share' as activity_type
       FROM shared_resources ORDER BY created_at DESC LIMIT 10`
    ).catch(() => ({ rows: [] }));
    const activity = [...comments.rows, ...shares.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 30);
    res.json(activity);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alias: GET /:datasetId/comments → GET /comments/dataset/:datasetId
router.get('/:datasetId/comments', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.role as user_role FROM comments c LEFT JOIN users u ON c.user_id=u.id
       WHERE c.target_type='dataset' AND c.target_id=$1 ORDER BY c.created_at ASC`,
      [req.params.datasetId]
    );
    res.json(result.rows.map(c => ({ ...c, replies: [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alias: POST /:datasetId/comments → POST /comments
router.post('/:datasetId/comments', authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const result = await pool.query(
      'INSERT INTO comments (target_type, target_id, content, user_id) VALUES ($1,$2,$3,$4) RETURNING *',
      ['dataset', req.params.datasetId, content, req.user.id]
    );
    res.status(201).json({ ...result.rows[0], user_name: req.user.name, replies: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Comments
router.get('/comments/:targetType/:targetId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.role as user_role FROM comments c LEFT JOIN users u ON c.user_id=u.id
       WHERE c.target_type=$1 AND c.target_id=$2 ORDER BY c.created_at ASC`,
      [req.params.targetType, req.params.targetId]
    );
    res.json(result.rows.map(c => ({ ...c, replies: [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/comments', authenticate, async (req, res) => {
  try {
    const { target_type, target_id, content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const result = await pool.query(
      'INSERT INTO comments (target_type, target_id, content, user_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [target_type, target_id, content, req.user.id]
    );
    const comment = { ...result.rows[0], user_name: req.user.name, replies: [] };
    res.status(201).json(comment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/comments/:id', authenticate, async (req, res) => {
  try {
    const { content, resolved } = req.body;
    const result = await pool.query(
      'UPDATE comments SET content=COALESCE($1,content), resolved=COALESCE($2,resolved), updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING *',
      [content, resolved, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/comments/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM comments WHERE id=$1 AND (user_id=$2 OR $3=true)', [req.params.id, req.user.id, req.user.role === 'admin']);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Annotations
router.get('/annotations/:datasetId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name as user_name FROM annotations a LEFT JOIN users u ON a.user_id=u.id WHERE a.dataset_id=$1 ORDER BY a.created_at DESC`,
      [req.params.datasetId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/annotations', authenticate, async (req, res) => {
  try {
    const { dataset_id, row_index, column_name, content, annotation_type = 'note' } = req.body;
    const result = await pool.query(
      'INSERT INTO annotations (dataset_id, row_index, column_name, content, annotation_type, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [dataset_id, row_index, column_name, content, annotation_type, req.user.id]
    );
    res.status(201).json({ ...result.rows[0], user_name: req.user.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/annotations/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM annotations WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sharing
router.post('/share', authenticate, async (req, res) => {
  try {
    const { resource_type, resource_id, shared_with_email, permission = 'read', expires_at } = req.body;
    const user = await pool.query('SELECT id FROM users WHERE email=$1', [shared_with_email]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    const result = await pool.query(
      `INSERT INTO shares (resource_type, resource_id, shared_by, shared_with, permission, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *`,
      [resource_type, resource_id, req.user.id, user.rows[0].id, permission, expires_at || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/shares/:resourceType/:resourceId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.name as shared_with_name, u.email as shared_with_email FROM shares s LEFT JOIN users u ON s.shared_with=u.id
       WHERE s.resource_type=$1 AND s.resource_id=$2 AND s.shared_by=$3`,
      [req.params.resourceType, req.params.resourceId, req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
