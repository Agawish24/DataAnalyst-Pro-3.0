const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { removeDuplicates, fillMissingValues, dropMissingRows, normalizeColumn, trimStrings } = require('../helpers/dataClean');

const router = express.Router();

const applyStep = (rows, step) => {
  const { operation, parameters = {} } = step;
  switch (operation) {
    case 'remove_duplicates': return removeDuplicates(rows);
    case 'fill_missing': return fillMissingValues(rows, parameters.strategy || 'mean', parameters.columns || []);
    case 'drop_missing_rows': return dropMissingRows(rows, parameters.columns || []);
    case 'normalize': return normalizeColumn(rows, parameters.column, parameters.method || 'minmax');
    case 'trim_strings': return trimStrings(rows);
    default: return rows;
  }
};

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.name as creator_name FROM recipes r LEFT JOIN users u ON r.created_by=u.id WHERE r.created_by=$1 OR r.is_public=true ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description = '', steps = [], tags = [], is_public = false } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      'INSERT INTO recipes (name, description, steps, tags, created_by, is_public) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, description, JSON.stringify(steps), tags, req.user.id, is_public]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT r.*, u.name as creator_name FROM recipes r LEFT JOIN users u ON r.created_by=u.id WHERE r.id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, steps, tags, is_public } = req.body;
    const result = await pool.query(
      `UPDATE recipes SET name=COALESCE($1,name), description=COALESCE($2,description), steps=COALESCE($3,steps), tags=COALESCE($4,tags), is_public=COALESCE($5,is_public) WHERE id=$6 AND created_by=$7 RETURNING *`,
      [name, description, steps ? JSON.stringify(steps) : null, tags, is_public, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found or unauthorized' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM recipes WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Apply recipe to a dataset
router.post('/:id/apply/:datasetId', authenticate, async (req, res) => {
  try {
    const recipe = await pool.query('SELECT * FROM recipes WHERE id=$1', [req.params.id]);
    if (!recipe.rows.length) return res.status(404).json({ error: 'Recipe not found' });
    const steps = recipe.rows[0].steps || [];

    const data = await pool.query(`SELECT * FROM data_${req.params.datasetId} LIMIT 10000`);
    let rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    const before = rows.length;

    for (const step of steps) rows = applyStep(rows, step);

    // Save back
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      await pool.query(`TRUNCATE data_${req.params.datasetId}`);
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const vals = batch.map((row, bi) => `(${cols.map((c, ci) => `$${bi * cols.length + ci + 1}`).join(',')})`).join(',');
        const params = batch.flatMap(row => cols.map(c => String(row[c] ?? '')));
        await pool.query(`INSERT INTO data_${req.params.datasetId} (${cols.map(c=>`"${c.replace(/"/g,'')}"`).join(',')}) VALUES ${vals}`, params);
      }
    }

    await pool.query('UPDATE datasets SET row_count=$1, updated_at=NOW() WHERE id=$2', [rows.length, req.params.datasetId]);
    await pool.query('UPDATE recipes SET usage_count=usage_count+1 WHERE id=$1', [req.params.id]);
    await pool.query('INSERT INTO recipe_applications (recipe_id, dataset_id, applied_by, result_summary) VALUES ($1,$2,$3,$4)',
      [req.params.id, req.params.datasetId, req.user.id, JSON.stringify({ before, after: rows.length, steps: steps.length })]);

    res.json({ message: 'Recipe applied', before, after: rows.length, stepsApplied: steps.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
