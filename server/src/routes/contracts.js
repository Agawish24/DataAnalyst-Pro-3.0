const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT dc.*, d.name as dataset_name FROM data_contracts dc
       LEFT JOIN datasets d ON dc.dataset_id=d.id
       WHERE dc.created_by=$1 ORDER BY dc.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, dataset_id, rules, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!rules?.length) return res.status(400).json({ error: 'rules array required' });
    const r = await pool.query(
      `INSERT INTO data_contracts (name, description, dataset_id, rules, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, description, dataset_id || null, JSON.stringify(rules), req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, rules, description } = req.body;
    const r = await pool.query(
      `UPDATE data_contracts SET name=$1, rules=$2, description=$3, updated_at=NOW()
       WHERE id=$4 AND created_by=$5 RETURNING *`,
      [name, JSON.stringify(rules), description, req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM data_contracts WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/validate', authenticate, async (req, res) => {
  try {
    const { dataset_id } = req.body;
    const ctr = await pool.query('SELECT * FROM data_contracts WHERE id=$1', [req.params.id]);
    if (!ctr.rows.length) return res.status(404).json({ error: 'Contract not found' });

    const c = ctr.rows[0];
    const rules = typeof c.rules === 'string' ? JSON.parse(c.rules) : c.rules;
    const targetId = dataset_id || c.dataset_id;
    if (!targetId) return res.status(400).json({ error: 'No dataset specified' });

    const [dataResult, metaResult] = await Promise.all([
      pool.query(`SELECT * FROM data_${targetId} LIMIT 10000`),
      pool.query('SELECT * FROM datasets WHERE id=$1', [targetId]),
    ]);

    const rows = dataResult.rows;
    const meta = metaResult.rows[0];
    const columns = rows.length ? Object.keys(rows[0]).filter(k => k !== 'row_index') : [];
    const violations = [];
    const checks = [];

    for (const rule of (rules || [])) {
      const { type, column, params = {} } = rule;

      if (type === 'required_column') {
        const exists = columns.includes(column);
        checks.push({ rule: type, column, passed: exists, message: exists ? `"${column}" exists` : `"${column}" missing` });
        if (!exists) violations.push({ severity: 'error', rule: type, column, message: `Required column "${column}" is missing` });

      } else if (type === 'not_null') {
        const nullCount = rows.filter(r => r[column] == null || r[column] === '').length;
        const nullRate = rows.length ? nullCount / rows.length : 0;
        const maxAllowed = params.max_null_rate ?? 0;
        const passed = nullRate <= maxAllowed;
        checks.push({ rule: type, column, passed, message: `${(nullRate * 100).toFixed(1)}% null (max: ${(maxAllowed * 100).toFixed(1)}%)` });
        if (!passed) violations.push({ severity: 'error', rule: type, column, message: `${nullCount} nulls (${(nullRate * 100).toFixed(1)}%) exceed threshold` });

      } else if (type === 'value_range') {
        const vals = rows.map(r => parseFloat(r[column])).filter(v => !isNaN(v));
        const out = vals.filter(v =>
          (params.min != null && v < params.min) || (params.max != null && v > params.max)
        ).length;
        const passed = out === 0;
        checks.push({ rule: type, column, passed, message: passed ? 'All in range' : `${out} out of [${params.min ?? '-∞'}, ${params.max ?? '+∞'}]` });
        if (!passed) violations.push({ severity: 'warning', rule: type, column, message: `${out} values outside [${params.min ?? '-∞'}, ${params.max ?? '+∞'}]` });

      } else if (type === 'unique') {
        const vals = rows.map(r => r[column]).filter(v => v != null);
        const dups = vals.length - new Set(vals).size;
        const passed = dups === 0;
        checks.push({ rule: type, column, passed, message: passed ? 'All unique' : `${dups} duplicates` });
        if (!passed) violations.push({ severity: 'warning', rule: type, column, message: `${dups} duplicate values` });

      } else if (type === 'allowed_values') {
        const allowed = new Set((params.values || []).map(String));
        const invalid = rows.filter(r => r[column] != null && !allowed.has(String(r[column]))).length;
        const passed = invalid === 0;
        checks.push({ rule: type, column, passed, message: passed ? 'All allowed' : `${invalid} invalid values` });
        if (!passed) violations.push({ severity: 'error', rule: type, column, message: `${invalid} rows have disallowed values` });

      } else if (type === 'row_count') {
        const count = rows.length;
        const passed = (!params.min || count >= params.min) && (!params.max || count <= params.max);
        checks.push({ rule: type, column: null, passed, message: `${count} rows (expected ${params.min ?? 0}–${params.max ?? '∞'})` });
        if (!passed) violations.push({ severity: 'warning', rule: type, column: null, message: `Row count ${count} outside [${params.min ?? 0}, ${params.max ?? '∞'}]` });

      } else if (type === 'schema_match') {
        const expected = params.columns || [];
        const missing = expected.filter(col => !columns.includes(col));
        const extra = columns.filter(col => !expected.includes(col));
        const passed = missing.length === 0;
        checks.push({ rule: type, column: null, passed, message: passed ? 'Schema matches' : `Missing: [${missing.join(', ')}]` });
        if (missing.length) violations.push({ severity: 'error', rule: type, column: null, message: `Missing columns: [${missing.join(', ')}]` });
        if (extra.length) violations.push({ severity: 'info', rule: type, column: null, message: `Extra columns: [${extra.join(', ')}]` });
      }
    }

    const score = Math.round((checks.filter(c => c.passed).length / Math.max(checks.length, 1)) * 100);
    const errors = violations.filter(v => v.severity === 'error').length;
    const warnings = violations.filter(v => v.severity === 'warning').length;

    await pool.query(
      `UPDATE data_contracts SET last_validated_at=NOW(), last_score=$1 WHERE id=$2`,
      [score, req.params.id]
    ).catch(() => {});

    res.json({
      contract: c.name, dataset: meta?.name, dataset_id: targetId,
      score, passed: errors === 0, errors, warnings,
      checks, violations, rows_checked: rows.length,
      validated_at: new Date().toISOString(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
