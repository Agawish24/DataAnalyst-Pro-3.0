const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { removeDuplicates, fillMissingValues, dropMissingRows, normalizeColumn, trimStrings } = require('../helpers/dataClean');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.name as creator_name FROM pipelines p LEFT JOIN users u ON p.created_by=u.id WHERE p.created_by=$1 ORDER BY p.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description = '', steps = [], source_config = {}, destination_config = {} } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      'INSERT INTO pipelines (name, description, steps, source_config, destination_config, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, description, JSON.stringify(steps), JSON.stringify(source_config), JSON.stringify(destination_config), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, steps, source_config, destination_config, is_active } = req.body;
    const result = await pool.query(
      `UPDATE pipelines SET name=COALESCE($1,name), description=COALESCE($2,description),
       steps=COALESCE($3,steps), source_config=COALESCE($4,source_config),
       destination_config=COALESCE($5,destination_config), is_active=COALESCE($6,is_active), updated_at=NOW()
       WHERE id=$7 AND created_by=$8 RETURNING *`,
      [name, description, steps ? JSON.stringify(steps) : null, source_config ? JSON.stringify(source_config) : null,
       destination_config ? JSON.stringify(destination_config) : null, is_active, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM pipelines WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Execute pipeline
router.post('/:id/run', authenticate, async (req, res) => {
  try {
    const pipeline = await pool.query('SELECT * FROM pipelines WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!pipeline.rows.length) return res.status(404).json({ error: 'Pipeline not found' });
    const p = pipeline.rows[0];

    const runRes = await pool.query('INSERT INTO pipeline_runs (pipeline_id, status) VALUES ($1,$2) RETURNING id', [p.id, 'running']);
    const runId = runRes.rows[0].id;

    let rowsProcessed = 0, error = null, result = {};
    try {
      const steps = p.steps || [];
      const src = p.source_config || {};

      if (src.dataset_id) {
        const data = await pool.query(`SELECT * FROM data_${src.dataset_id} LIMIT 10000`);
        let rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
        const before = rows.length;

        for (const step of steps) {
          const { operation, parameters = {} } = step;
          if (operation === 'remove_duplicates') rows = removeDuplicates(rows);
          else if (operation === 'fill_missing') rows = fillMissingValues(rows, parameters.strategy || 'mean', parameters.columns || []);
          else if (operation === 'drop_missing_rows') rows = dropMissingRows(rows, parameters.columns || []);
          else if (operation === 'normalize') rows = normalizeColumn(rows, parameters.column, parameters.method || 'minmax');
          else if (operation === 'trim_strings') rows = trimStrings(rows);
        }

        const dst = p.destination_config || {};
        if (dst.dataset_id && rows.length) {
          const cols = Object.keys(rows[0]);
          await pool.query(`TRUNCATE data_${dst.dataset_id}`);
          const batchSize = 500;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const vals = batch.map((row, bi) => `(${cols.map((c, ci) => `$${bi * cols.length + ci + 1}`).join(',')})`).join(',');
            const params = batch.flatMap(row => cols.map(c => String(row[c] ?? '')));
            await pool.query(`INSERT INTO data_${dst.dataset_id} (${cols.map(c=>`"${c.replace(/"/g,'')}"`).join(',')}) VALUES ${vals}`, params);
          }
          await pool.query('UPDATE datasets SET row_count=$1, updated_at=NOW() WHERE id=$2', [rows.length, dst.dataset_id]);
        }

        rowsProcessed = rows.length;
        result = { before, after: rows.length, stepsRun: steps.length };
      }
    } catch (e) { error = e.message; }

    await pool.query(
      'UPDATE pipeline_runs SET status=$1, finished_at=NOW(), rows_processed=$2, result=$3, error_message=$4 WHERE id=$5',
      [error ? 'failed' : 'success', rowsProcessed, JSON.stringify(result), error, runId]
    );
    await pool.query('UPDATE pipelines SET last_run_at=NOW() WHERE id=$1', [p.id]);
    res.json({ run_id: runId, status: error ? 'failed' : 'success', rowsProcessed, result, error });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/runs', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pipeline_runs WHERE pipeline_id=$1 ORDER BY started_at DESC LIMIT 20', [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
