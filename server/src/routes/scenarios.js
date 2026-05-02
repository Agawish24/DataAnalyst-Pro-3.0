const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// --- Scenario CRUD ---
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, d.name as dataset_name FROM scenarios s
       LEFT JOIN datasets d ON s.dataset_id=d.id
       WHERE s.created_by=$1 ORDER BY s.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description = '', dataset_id, variables = [], assumptions = {} } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      `INSERT INTO scenarios (name, description, dataset_id, variables, assumptions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, description, dataset_id || null, JSON.stringify(variables), JSON.stringify(assumptions), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, variables, assumptions, last_result } = req.body;
    const result = await pool.query(
      `UPDATE scenarios SET name=COALESCE($1,name), description=COALESCE($2,description),
       variables=COALESCE($3,variables), assumptions=COALESCE($4,assumptions),
       last_result=COALESCE($5,last_result), updated_at=NOW()
       WHERE id=$6 AND created_by=$7 RETURNING *`,
      [name, description, variables ? JSON.stringify(variables) : null,
       assumptions ? JSON.stringify(assumptions) : null,
       last_result ? JSON.stringify(last_result) : null, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM scenarios WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Run a what-if simulation (server-side, no Python needed) ---
router.post('/:id/simulate', authenticate, async (req, res) => {
  try {
    const scenario = await pool.query('SELECT * FROM scenarios WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    if (!scenario.rows.length) return res.status(404).json({ error: 'Not found' });

    const { overrides = {} } = req.body; // { variableName: newValue }
    const vars = scenario.rows[0].variables || [];

    // Apply overrides to variable values
    const simVars = vars.map(v => ({
      ...v,
      simValue: overrides[v.name] !== undefined ? parseFloat(overrides[v.name]) : v.baseValue,
    }));

    // Compute formula outputs if dataset linked
    const dsId = scenario.rows[0].dataset_id;
    let dataStats = null;
    if (dsId) {
      try {
        const data = await pool.query(`SELECT * FROM data_${dsId} LIMIT 5000`);
        const rows = data.rows;
        if (rows.length) {
          const numCols = Object.keys(rows[0]).filter(k => k !== 'row_index');
          dataStats = {};
          for (const col of numCols) {
            const vals = rows.map(r => parseFloat(r[col])).filter(n => !isNaN(n));
            if (vals.length > 0) {
              const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
              dataStats[col] = { mean: +mean.toFixed(4), min: Math.min(...vals), max: Math.max(...vals) };
            }
          }
        }
      } catch { /* no data table */ }
    }

    // Sensitivity: for each variable, compute impact of ±10%
    const sensitivity = simVars.map(v => {
      const base = v.baseValue || 1;
      const impact = ((v.simValue - base) / (base || 1)) * 100;
      return { name: v.name, baseValue: base, simValue: v.simValue, impactPct: +impact.toFixed(2), weight: v.weight || 1 };
    });

    // Weighted composite score
    const totalWeight = simVars.reduce((s, v) => s + (v.weight || 1), 0);
    const compositeImpact = sensitivity.reduce((s, v) => s + v.impactPct * (v.weight || 1), 0) / (totalWeight || 1);

    const result = {
      scenarioId: scenario.rows[0].id,
      variables: simVars,
      sensitivity,
      compositeImpact: +compositeImpact.toFixed(2),
      dataStats,
      simulatedAt: new Date().toISOString(),
    };

    await pool.query('UPDATE scenarios SET last_result=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(result), req.params.id]);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Monte Carlo via Python service
router.post('/monte-carlo', authenticate, async (req, res) => {
  try {
    const PYTHON = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${PYTHON}/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
