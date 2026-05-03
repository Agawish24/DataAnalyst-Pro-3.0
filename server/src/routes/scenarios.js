const express = require('express');
const https = require('https');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();
const PYTHON = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

// ── Groq AI helper ─────────────────────────────────────────────────────────
const groqChat = (messages) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: 500, temperature: 0.4 });
  const req = https.request({
    hostname: 'api.groq.com', port: 443, path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse')); } });
  });
  req.on('error', reject);
  req.write(body); req.end();
});

const buildNarrative = async ({ variables, mcResult, scenarioName, datasetName }) => {
  const { mean, std, percentiles, tornado, prob_above_baseline, iterations } = mcResult || {};
  const topVar = (tornado || [])[0];
  const p5  = percentiles?.['5'];
  const p95 = percentiles?.['95'];
  const fallback = `The simulation ran ${(iterations || 0).toLocaleString()} iterations across ${variables?.length || 0} variable${variables?.length !== 1 ? 's' : ''}. ` +
    `Expected outcome: ${mean?.toFixed(2)} (±${std?.toFixed(2)} std dev). ` +
    `The 90% confidence interval spans ${p5?.toFixed(2)} to ${p95?.toFixed(2)}. ` +
    (topVar ? `The most sensitive variable is "${topVar.name}" with a ${topVar.swing_pct?.toFixed(1)}% swing on the composite outcome.` : '');

  if (!process.env.GROQ_API_KEY) return fallback;

  const varSummary = (variables || []).map(v =>
    `${v.name}: base=${v.baseValue}, distribution=${v.distribution}, uncertainty=${v.uncertainty}`
  ).join('; ');
  const tornadoSummary = (tornado || []).slice(0, 3).map(t =>
    `${t.name} (±${t.swing_pct?.toFixed(1)}% swing)`
  ).join(', ');

  try {
    const r = await groqChat([
      { role: 'system', content: 'You explain Monte Carlo simulation results to business executives in 2-3 sentences. Be specific about numbers, risk levels, and one action to take. No markdown, no bullet points.' },
      { role: 'user', content: `Scenario: "${scenarioName || 'Unnamed'}" on dataset "${datasetName || 'unknown'}". Variables: ${varSummary}. Results: mean=${mean?.toFixed(2)}, std=${std?.toFixed(2)}, P5=${p5?.toFixed(2)}, P95=${p95?.toFixed(2)}. Top sensitive variables: ${tornadoSummary}. Summarize the simulation outcome, the key risk, and one business recommendation.` }
    ]);
    return r?.choices?.[0]?.message?.content || fallback;
  } catch { return fallback; }
};

// ── Write lineage event ────────────────────────────────────────────────────
const writeLineage = async (datasetId, eventType, actor, metadata) => {
  if (!datasetId) return;
  try {
    await pool.query(
      `INSERT INTO lineage (dataset_id, event_type, actor, metadata) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [datasetId, eventType, actor, JSON.stringify(metadata)]
    );
  } catch { /* lineage table may not exist yet */ }
};

// ════════════════════════════════════════════════════════════════════════════
// CRUD
// ════════════════════════════════════════════════════════════════════════════
router.get('/', authenticate, async (req, res) => {
  try {
    // Return own scenarios + shared team scenarios
    const result = await pool.query(
      `SELECT s.*, d.name as dataset_name
       FROM scenarios s LEFT JOIN datasets d ON s.dataset_id=d.id
       WHERE s.created_by=$1 OR s.shared=true
       ORDER BY s.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description = '', dataset_id, variables = [], assumptions = {}, shared = false } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    // Add shared column gracefully — use DO UPDATE in case it doesn't exist
    let result;
    try {
      result = await pool.query(
        `INSERT INTO scenarios (name, description, dataset_id, variables, assumptions, created_by, shared, status, audit_trail)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft','[]') RETURNING *`,
        [name, description, dataset_id || null, JSON.stringify(variables), JSON.stringify(assumptions), req.user.id, shared]
      );
    } catch {
      // Fallback if new columns not yet present
      result = await pool.query(
        `INSERT INTO scenarios (name, description, dataset_id, variables, assumptions, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, description, dataset_id || null, JSON.stringify(variables), JSON.stringify(assumptions), req.user.id]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, variables, assumptions, last_result, shared, status } = req.body;
    const result = await pool.query(
      `UPDATE scenarios SET
         name=COALESCE($1,name), description=COALESCE($2,description),
         variables=COALESCE($3,variables), assumptions=COALESCE($4,assumptions),
         last_result=COALESCE($5,last_result), updated_at=NOW()
       WHERE id=$6 AND created_by=$7 RETURNING *`,
      [name, description,
       variables ? JSON.stringify(variables) : null,
       assumptions ? JSON.stringify(assumptions) : null,
       last_result ? JSON.stringify(last_result) : null,
       req.params.id, req.user.id]
    );
    // Try to update new columns if present
    try {
      if (shared !== undefined || status !== undefined) {
        await pool.query(
          `UPDATE scenarios SET shared=COALESCE($1,shared), status=COALESCE($2,status) WHERE id=$3 AND created_by=$4`,
          [shared ?? null, status ?? null, req.params.id, req.user.id]
        );
      }
    } catch { /* ignore if columns absent */ }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM scenarios WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// What-if simulation (server-side)
// ════════════════════════════════════════════════════════════════════════════
router.post('/:id/simulate', authenticate, async (req, res) => {
  try {
    const scenario = await pool.query('SELECT * FROM scenarios WHERE id=$1', [req.params.id]);
    if (!scenario.rows.length) return res.status(404).json({ error: 'Not found' });

    const sc = scenario.rows[0];
    const { overrides = {} } = req.body;
    const vars = sc.variables || [];
    const simVars = vars.map(v => ({
      ...v,
      simValue: overrides[v.name] !== undefined ? parseFloat(overrides[v.name]) : v.baseValue,
    }));

    const sensitivity = simVars.map(v => {
      const base = v.baseValue || 1;
      const impact = ((v.simValue - base) / (base || 1)) * 100;
      return { name: v.name, baseValue: base, simValue: v.simValue, impactPct: +impact.toFixed(2), weight: v.weight || 1 };
    });

    const totalWeight = simVars.reduce((s, v) => s + (v.weight || 1), 0);
    const compositeImpact = sensitivity.reduce((s, v) => s + v.impactPct * (v.weight || 1), 0) / (totalWeight || 1);
    const runAt = new Date().toISOString();

    const meta = await pool.query('SELECT name FROM datasets WHERE id=$1', [sc.dataset_id]).catch(() => ({ rows: [] }));
    const datasetName = meta.rows[0]?.name || 'unknown dataset';

    const result = { scenarioId: sc.id, variables: simVars, sensitivity, compositeImpact: +compositeImpact.toFixed(2), simulatedAt: runAt };

    await pool.query('UPDATE scenarios SET last_result=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(result), sc.id]);

    // Governance lineage
    await writeLineage(sc.dataset_id, 'scenario_simulate', `user:${req.user.id}`, {
      scenario_name: sc.name, composite_impact: result.compositeImpact, variables: simVars.length, run_at: runAt
    });

    const governance = {
      scenario_name: sc.name, dataset_name: datasetName, dataset_version: '1.0',
      run_at: runAt,
      run_at_display: new Date(runAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
      variables_count: vars.length,
    };

    res.json({ ...result, governance });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// Monte Carlo via Python — with narrative + governance
// ════════════════════════════════════════════════════════════════════════════
router.post('/monte-carlo', authenticate, async (req, res) => {
  try {
    const { variables, iterations = 10000, scenario_id, dataset_id, scenario_name, baseline_value } = req.body;

    const pyRes = await axios.post(`${PYTHON}/monte-carlo`, {
      variables, iterations, baseline_value: baseline_value || 0
    }, { timeout: 60000 });

    const mcResult = pyRes.data;
    const runAt = new Date().toISOString();

    // Fetch dataset name for governance
    let datasetName = 'unknown dataset';
    if (dataset_id) {
      const m = await pool.query('SELECT name FROM datasets WHERE id=$1', [dataset_id]).catch(() => ({ rows: [] }));
      datasetName = m.rows[0]?.name || datasetName;
    }

    const scName = scenario_name || 'Unnamed Scenario';

    // Build Groq narrative + governance in parallel
    const [narrative] = await Promise.all([
      buildNarrative({ variables, mcResult, scenarioName: scName, datasetName }),
    ]);

    const governance = {
      scenario_name: scName,
      dataset_name: datasetName,
      dataset_version: '1.0',
      run_at: runAt,
      run_at_display: new Date(runAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
      iterations,
      variables_count: (variables || []).length,
      distributions_used: [...new Set((variables || []).map(v => v.distribution || 'normal'))],
    };

    // Lineage event + scenario last_result update in parallel
    await Promise.all([
      writeLineage(dataset_id, 'monte_carlo_run', `user:${req.user.id}`, {
        scenario_name: scName, iterations, mean: mcResult.mean, std: mcResult.std, run_at: runAt,
        variables: (variables || []).length,
      }),
      scenario_id ? pool.query(
        'UPDATE scenarios SET last_result=$1, updated_at=NOW() WHERE id=$2',
        [JSON.stringify({ ...mcResult, narrative, governance }), scenario_id]
      ).catch(() => {}) : Promise.resolve(),
    ]);

    res.json({ ...mcResult, narrative, governance });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

// Alias for frontend compatibility
router.post('/run', authenticate, (req, res, next) => {
  req.url = '/monte-carlo';
  next('route');
});

// ════════════════════════════════════════════════════════════════════════════
// Approval workflow
// ════════════════════════════════════════════════════════════════════════════
router.post('/:id/submit-approval', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE scenarios SET status='pending_approval', updated_at=NOW() WHERE id=$1 AND created_by=$2`,
      [req.params.id, req.user.id]
    ).catch(() => {});
    // Append audit trail entry
    try {
      await pool.query(
        `UPDATE scenarios SET audit_trail = COALESCE(audit_trail,'[]'::jsonb) || $1::jsonb WHERE id=$2`,
        [JSON.stringify([{ action: 'submitted_for_approval', user_id: req.user.id, at: new Date().toISOString() }]), req.params.id]
      );
    } catch { /* audit_trail column may not exist */ }
    res.json({ message: 'Submitted for approval' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/approve', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE scenarios SET status='approved', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    ).catch(() => {});
    try {
      await pool.query(
        `UPDATE scenarios SET audit_trail = COALESCE(audit_trail,'[]'::jsonb) || $1::jsonb WHERE id=$2`,
        [JSON.stringify([{ action: 'approved', user_id: req.user.id, at: new Date().toISOString() }]), req.params.id]
      );
    } catch { /* ignore */ }
    res.json({ message: 'Approved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
