const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, domain, sensitivity, tag } = req.query;
    let query = `SELECT c.*, d.name as dataset_name, d.row_count, d.source, d.created_at as dataset_created, u.name as owner_name
      FROM catalog_entries c
      JOIN datasets d ON c.dataset_id = d.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); query += ` AND (d.name ILIKE $${params.length} OR c.description ILIKE $${params.length} OR c.owner ILIKE $${params.length})`; }
    if (domain) { params.push(domain); query += ` AND c.domain = $${params.length}`; }
    if (sensitivity) { params.push(sensitivity); query += ` AND c.sensitivity = $${params.length}`; }
    if (tag) { params.push(tag); query += ` AND $${params.length} = ANY(c.tags)`; }
    query += ' ORDER BY d.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/tags', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT unnest(tags) as tag FROM catalog_entries ORDER BY tag`);
    res.json(result.rows.map(r => r.tag));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/domains', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT domain FROM catalog_entries WHERE domain IS NOT NULL ORDER BY domain`);
    res.json(result.rows.map(r => r.domain));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:datasetId', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT c.*, d.name, d.schema, d.row_count, d.source FROM catalog_entries c JOIN datasets d ON c.dataset_id=d.id WHERE c.dataset_id=$1', [req.params.datasetId]);
    if (!result.rows.length) {
      const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
      if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
      return res.json({ dataset_id: parseInt(req.params.datasetId), ...ds.rows[0], tags: [], lineage: [], custom_metadata: {} });
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:datasetId', authenticate, async (req, res) => {
  try {
    const { tags = [], description = '', owner = '', domain = '', sensitivity = 'internal', lineage = [], custom_metadata = {} } = req.body;
    const existing = await pool.query('SELECT id FROM catalog_entries WHERE dataset_id=$1', [req.params.datasetId]);
    let result;
    if (existing.rows.length) {
      result = await pool.query(
        `UPDATE catalog_entries SET tags=$1, description=$2, owner=$3, domain=$4, sensitivity=$5, lineage=$6, custom_metadata=$7, updated_at=NOW() WHERE dataset_id=$8 RETURNING *`,
        [tags, description, owner, domain, sensitivity, JSON.stringify(lineage), JSON.stringify(custom_metadata), req.params.datasetId]
      );
    } else {
      result = await pool.query(
        `INSERT INTO catalog_entries (dataset_id, tags, description, owner, domain, sensitivity, lineage, custom_metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.datasetId, tags, description, owner, domain, sensitivity, JSON.stringify(lineage), JSON.stringify(custom_metadata)]
      );
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
