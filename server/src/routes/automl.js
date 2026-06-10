const express = require('express');
const https = require('https');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { pyPost } = require('../utils/pythonClient');

const router = express.Router();

// ── Groq AI helper ───────────────────────────────────────────────────────────
const groqChat = (messages, model = 'llama-3.1-8b-instant') => new Promise((resolve, reject) => {
  const body = JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.35 });
  const req = https.request({
    hostname: 'api.groq.com', port: 443, path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse error')); } });
  });
  req.on('error', reject);
  req.write(body); req.end();
});

// ── AI narrative: why the winning model won ──────────────────────────────────
const buildNarrative = async (mlData, datasetName, targetCol) => {
  const { best_model, best_score, metric, all_scores, feature_importance, task_type, sample_size } = mlData;

  const scoreLines = Object.entries(all_scores || {})
    .sort(([, a], [, b]) => (b || 0) - (a || 0))
    .map(([m, s]) => `${m}: ${s !== null ? (s * 100).toFixed(1) + '%' : 'failed'}`)
    .join(', ');

  const topFeatures = Object.entries(feature_importance || {})
    .sort(([, a], [, b]) => b - a).slice(0, 3)
    .map(([f, v]) => `${f} (${(v * 100).toFixed(1)}%)`)
    .join(', ');

  const sorted = Object.entries(all_scores || {}).sort(([, a], [, b]) => (b || 0) - (a || 0));
  const runner = sorted[1];
  const gap = runner?.[1] ? ((best_score - runner[1]) * 100).toFixed(1) : null;
  const topFeat = Object.entries(feature_importance || {}).sort(([, a], [, b]) => b - a)[0];

  const fallback = `${best_model} achieved the highest ${metric} of ${(best_score * 100).toFixed(1)}%` +
    (gap ? `, outperforming ${runner[0]} by ${gap}pp` : '') + '. ' +
    (topFeat ? `The top predictor is "${topFeat[0]}" (${(topFeat[1] * 100).toFixed(1)}% importance). ` : '') +
    `Focus data collection efforts on high-importance features to improve model performance further.`;

  if (!process.env.GROQ_API_KEY) return fallback;

  try {
    const r = await groqChat([
      { role: 'system', content: 'You explain ML results in 2-3 sentences of plain business language. Be specific about which model won and why, what the top features mean, and one actionable next step. No markdown, no bullet points.' },
      { role: 'user', content: `AutoML results on "${datasetName}" (${sample_size?.toLocaleString()} rows), predicting "${targetCol}" (${task_type}).\nWinner: ${best_model} — ${metric}=${(best_score * 100).toFixed(1)}%\nAll models: ${scoreLines}\nTop features: ${topFeatures || 'N/A'}\n\nExplain why ${best_model} won, what the top features reveal, and one business action.` }
    ]);
    return r?.choices?.[0]?.message?.content || fallback;
  } catch {
    return fallback;
  }
};

// ── Task-type detection ──────────────────────────────────────────────────────
const detectTaskType = (rows, targetCol, requested) => {
  if (requested && requested !== 'auto') return requested;
  const sample = rows.slice(0, 50).map(r => r[targetCol]).filter(v => v != null);
  const unique = new Set(sample).size;
  const isNumeric = sample.every(v => !isNaN(parseFloat(v)));
  return (!isNumeric || unique <= 10) ? 'classification' : 'regression';
};

// ── Single-dataset run ────────────────────────────────────────────────────────
router.post('/:datasetId/run', authenticate, async (req, res) => {
  try {
    const { target_col, feature_cols, task_type } = req.body;
    if (!target_col) return res.status(400).json({ error: 'target_col required' });

    const [dataResult, metaResult] = await Promise.all([
      pool.query(`SELECT * FROM data_${req.params.datasetId} LIMIT 3000`),
      pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]),
    ]);

    const rows = dataResult.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    const ds = metaResult.rows[0];
    const datasetName = ds?.name || `Dataset ${req.params.datasetId}`;
    const detectedTask = detectTaskType(rows, target_col, task_type);
    const runAt = new Date().toISOString();

    const pyRes = await pyPost('/automl', {
      data: rows, target_col, feature_cols, task_type: detectedTask
    }, { timeout: 180000 });

    const mlData = pyRes.data;

    const [narrative] = await Promise.all([
      buildNarrative(mlData, datasetName, target_col),
    ]);

    const governance = {
      dataset_id: parseInt(req.params.datasetId),
      dataset_name: datasetName,
      dataset_version: ds?.version || '1.0',
      target_col,
      task_type: detectedTask,
      run_at: runAt,
      run_at_display: new Date(runAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
      sample_size: mlData.sample_size,
      models_compared: Object.keys(mlData.all_scores || {}).length,
    };

    const [saved] = await Promise.all([
      pool.query(
        `INSERT INTO automl_runs (user_id, dataset_id, target_col, feature_cols, task_type, best_model, best_score, results)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.id, req.params.datasetId, target_col, feature_cols || [], detectedTask,
         mlData.best_model, mlData.best_score, JSON.stringify(mlData)]
      ),
      pool.query(
        `INSERT INTO lineage (dataset_id, event_type, actor, metadata) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [req.params.datasetId, 'automl_run', `user:${req.user.id}`,
         JSON.stringify({ best_model: mlData.best_model, score: mlData.best_score, metric: mlData.metric, run_at: runAt, models_compared: governance.models_compared })]
      ).catch(() => {}),
    ]);

    res.json({ ...mlData, runId: saved.rows[0].id, narrative, governance });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

// ── Cross-dataset AutoML ──────────────────────────────────────────────────────
router.post('/cross-dataset', authenticate, async (req, res) => {
  try {
    const { dataset_ids, join_key, target_col, feature_cols, task_type } = req.body;
    if (!dataset_ids?.length || dataset_ids.length < 2) return res.status(400).json({ error: 'Provide at least 2 dataset_ids' });
    if (!target_col) return res.status(400).json({ error: 'target_col required' });

    const [allRows, metas] = await Promise.all([
      Promise.all(dataset_ids.map(id =>
        pool.query(`SELECT * FROM data_${id} LIMIT 2000`)
          .then(r => r.rows.map(row => { const { row_index, ...rest } = row; return rest; }))
      )),
      Promise.all(dataset_ids.map(id =>
        pool.query('SELECT name FROM datasets WHERE id=$1', [id]).then(r => r.rows[0]?.name || `Dataset ${id}`)
      )),
    ]);

    // Union-stack datasets (column superset — works when schemas differ)
    let merged;
    if (join_key) {
      const lookup = {};
      allRows[1].forEach(r => { if (r[join_key] != null) lookup[String(r[join_key])] = r; });
      merged = allRows[0].map(row => ({ ...row, ...(lookup[String(row[join_key])] || {}) })).filter(r => r[target_col] != null);
    } else {
      merged = allRows.flat().filter(r => r[target_col] != null).slice(0, 3000);
    }

    if (merged.length < 20) return res.status(400).json({ error: 'Merged dataset has fewer than 20 valid rows — try union-stack mode (no join key) or check that the target column exists in both datasets' });

    const detectedTask = detectTaskType(merged, target_col, task_type);
    const runAt = new Date().toISOString();

    const pyRes = await pyPost('/automl', {
      data: merged, target_col, feature_cols, task_type: detectedTask
    }, { timeout: 180000 });

    const mlData = pyRes.data;
    const datasetLabel = metas.join(' + ');
    const narrative = await buildNarrative(mlData, datasetLabel, target_col);

    const governance = {
      datasets: dataset_ids.map((id, i) => ({ id, name: metas[i] })),
      merge_strategy: join_key ? `inner join on "${join_key}"` : 'union-stack',
      merged_rows: merged.length,
      target_col,
      task_type: detectedTask,
      run_at: runAt,
      run_at_display: new Date(runAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
      models_compared: Object.keys(mlData.all_scores || {}).length,
    };

    res.json({ ...mlData, narrative, governance, cross_dataset: true, dataset_label: datasetLabel });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

// ── History ───────────────────────────────────────────────────────────────────
router.get('/runs', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ar.*, d.name as dataset_name
       FROM automl_runs ar LEFT JOIN datasets d ON ar.dataset_id=d.id
       WHERE ar.user_id=$1 ORDER BY ar.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/runs/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM automl_runs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
