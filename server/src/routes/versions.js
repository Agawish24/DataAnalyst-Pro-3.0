const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Root GET — list all versions across datasets (for VersionControl page overview)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, u.name as creator_name, d.name as dataset_name
       FROM dataset_versions v
       LEFT JOIN users u ON v.created_by = u.id
       LEFT JOIN datasets d ON v.dataset_id = d.id
       ORDER BY v.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create a snapshot (version) of a dataset
router.post('/:datasetId/snapshot', authenticate, async (req, res) => {
  try {
    const { summary } = req.body;
    const dsId = req.params.datasetId;
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [dsId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    // Get next version number
    const vRes = await pool.query('SELECT COALESCE(MAX(version_number),0)+1 as next FROM dataset_versions WHERE dataset_id=$1', [dsId]);
    const vNum = vRes.rows[0].next;
    const snapshotTable = `snapshot_${dsId}_v${vNum}`;

    // Copy current data to snapshot table
    await pool.query(`CREATE TABLE IF NOT EXISTS ${snapshotTable} AS SELECT * FROM data_${dsId}`);

    const result = await pool.query(
      'INSERT INTO dataset_versions (dataset_id, version_number, snapshot_table, change_summary, row_count, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [dsId, vNum, snapshotTable, summary || `Version ${vNum}`, ds.rows[0].row_count, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List versions
router.get('/:datasetId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, u.name as creator_name FROM dataset_versions v LEFT JOIN users u ON v.created_by=u.id WHERE v.dataset_id=$1 ORDER BY v.version_number DESC`,
      [req.params.datasetId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rollback to a version
router.post('/:datasetId/rollback/:versionId', authenticate, async (req, res) => {
  try {
    const version = await pool.query('SELECT * FROM dataset_versions WHERE id=$1 AND dataset_id=$2', [req.params.versionId, req.params.datasetId]);
    if (!version.rows.length) return res.status(404).json({ error: 'Version not found' });
    const v = version.rows[0];

    // Verify snapshot table still exists before destructively truncating live data
    const snapCheck = await pool.query(`SELECT to_regclass($1)`, [v.snapshot_table]);
    if (!snapCheck.rows[0].to_regclass) {
      return res.status(400).json({ error: `Snapshot table "${v.snapshot_table}" no longer exists — cannot roll back to version ${v.version_number}` });
    }
    // Wrap TRUNCATE + restore in a transaction so data is never left half-written
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`TRUNCATE data_${req.params.datasetId}`);
      const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name!='row_index' ORDER BY ordinal_position`, [v.snapshot_table]);
      const colList = cols.rows.map(c => `"${c.column_name}"`).join(',');
      if (colList) {
        await client.query(`INSERT INTO data_${req.params.datasetId} (${colList}) SELECT ${colList} FROM ${v.snapshot_table}`);
      }
      await client.query('UPDATE datasets SET row_count=$1, updated_at=NOW() WHERE id=$2', [v.row_count, req.params.datasetId]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
    res.json({ message: `Rolled back to version ${v.version_number}`, version: v });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Compare two versions
router.get('/:datasetId/compare/:v1/:v2', authenticate, async (req, res) => {
  try {
    const ver1 = await pool.query('SELECT * FROM dataset_versions WHERE version_number=$1 AND dataset_id=$2', [req.params.v1, req.params.datasetId]);
    const ver2 = await pool.query('SELECT * FROM dataset_versions WHERE version_number=$1 AND dataset_id=$2', [req.params.v2, req.params.datasetId]);
    if (!ver1.rows.length || !ver2.rows.length) return res.status(404).json({ error: 'Version not found' });

    const t1 = ver1.rows[0].snapshot_table;
    const t2 = ver2.rows[0].snapshot_table;

    const [c1, c2] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM ${t1}`),
      pool.query(`SELECT COUNT(*) FROM ${t2}`)
    ]);
    const [s1, s2] = await Promise.all([
      pool.query(`SELECT * FROM ${t1} LIMIT 5`),
      pool.query(`SELECT * FROM ${t2} LIMIT 5`),
    ]);

    res.json({
      version1: { ...ver1.rows[0], rowCount: parseInt(c1.rows[0].count), sample: s1.rows },
      version2: { ...ver2.rows[0], rowCount: parseInt(c2.rows[0].count), sample: s2.rows },
      rowDiff: parseInt(c2.rows[0].count) - parseInt(c1.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
