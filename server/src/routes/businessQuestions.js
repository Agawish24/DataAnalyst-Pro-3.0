const express = require('express');
const https = require('https');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { computeFullSummary, computeCorrelationMatrix } = require('../helpers/statsHelper');

const router = express.Router();
const { pyPost: pyPostBQ } = require('../utils/pythonClient');

// ── Groq AI helper ───────────────────────────────────────────────────────────
const groqChat = (messages, model = 'llama-3.1-8b-instant') => new Promise((resolve, reject) => {
  const body = JSON.stringify({ model, messages, max_tokens: 800, temperature: 0.4 });
  const req = https.request({
    hostname: 'api.groq.com', port: 443, path: '/openai/v1/chat/completions',
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('Groq parse error')); } });
  });
  req.on('error', reject);
  req.write(body);
  req.end();
});

// ── Python multi-method anomaly detection ────────────────────────────────────
const runMultiMethodAnomalyDetection = async (rows, numericCols, targetCol) => {
  try {
    const r = await pyPostBQ('/anomaly/multi-method', {
      rows,
      columns: numericCols,
      target_col: targetCol,
      zscore_threshold: 3.0,
      contamination: 0.05,
    }, { timeout: 30000 });
    return r.data;
  } catch (e) {
    return null; // graceful fallback
  }
};

// ── JS-side statistical detection (fallback + enrichment) ────────────────────
const jsSideDetection = (rows, targetCol, stats) => {
  const findings = [];
  if (!targetCol || !stats) return findings;

  // Outliers via IQR
  if (stats.outliers?.length > 0) {
    findings.push({
      type: 'outliers',
      severity: stats.outliers.length > 10 ? 'high' : 'medium',
      confidence: Math.min(1, stats.outliers.length / 20),
      title: `${stats.outliers.length} outlier${stats.outliers.length > 1 ? 's' : ''} detected in "${targetCol}"`,
      detail: `Values far outside normal range: ${stats.outliers.slice(0, 5).map(v => Number(v).toFixed(2)).join(', ')}. These records deviate significantly from the distribution.`,
      metric: targetCol,
      method: 'IQR',
    });
  }

  // Distribution skew
  if (Math.abs(stats.skewness || 0) > 1) {
    findings.push({
      type: 'distribution',
      severity: Math.abs(stats.skewness) > 2 ? 'high' : 'medium',
      confidence: Math.min(1, Math.abs(stats.skewness) / 3),
      title: `"${targetCol}" is ${stats.skewness > 0 ? 'right' : 'left'}-skewed (skewness = ${Number(stats.skewness).toFixed(2)})`,
      detail: `Non-normal distribution: Mean (${stats.mean}) is ${stats.skewness > 0 ? 'above' : 'below'} median (${stats.median}). This pattern often indicates outliers or data quality issues.`,
      metric: targetCol,
      method: 'Statistical',
    });
  }

  // Missing values
  const missingPct = ((rows.length - (stats.count || rows.length)) / rows.length * 100);
  if (missingPct > 5) {
    findings.push({
      type: 'missing_data',
      severity: missingPct > 20 ? 'high' : 'medium',
      confidence: Math.min(1, missingPct / 30),
      title: `${missingPct.toFixed(1)}% of "${targetCol}" values are missing`,
      detail: `Missing data may bias downstream aggregations and ML models. Consider imputation or upstream pipeline investigation.`,
      metric: targetCol,
      method: 'Statistical',
    });
  }

  return findings;
};

// ── Groq prescriptive narrative ──────────────────────────────────────────────
const buildGroqNarrative = async (question, targetCol, stats, findings, mlSummary, governance) => {
  if (!process.env.GROQ_API_KEY) return buildFallbackNarrative(question, targetCol, stats, findings, mlSummary);

  const context = [
    `Question: "${question}"`,
    `Target metric: ${targetCol}`,
    stats ? `Stats: mean=${stats.mean}, std=${stats.std}, min=${stats.min}, max=${stats.max}` : '',
    mlSummary ? `ML Anomaly Detection: ${mlSummary.anomalies_found} anomalies found (${mlSummary.anomaly_rate}% of ${mlSummary.total_rows} rows). Methods: Z-score flagged ${mlSummary.methods_agreement?.zscore_flagged || 0}, IQR flagged ${mlSummary.methods_agreement?.iqr_flagged || 0}, Isolation Forest flagged ${mlSummary.methods_agreement?.isolation_forest_flagged || 0}.` : '',
    findings.length > 0 ? `Statistical findings:\n${findings.map(f => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.detail}`).join('\n')}` : 'No high-confidence findings from statistical analysis.',
    governance ? `Governance: Dataset "${governance.name}", v${governance.version || '1.0'}, imported ${governance.imported || 'recently'}, ${governance.row_count || '?'} rows.` : '',
  ].filter(Boolean).join('\n');

  try {
    const result = await groqChat([
      { role: 'system', content: 'You are a senior data analyst giving prescriptive insights. Be specific, actionable, and concise. Reference the actual metric names and numbers. Maximum 4 short paragraphs. No markdown headers, no bullet points in narrative.' },
      { role: 'user', content: `Analyze this data situation and give prescriptive recommendations:\n\n${context}` }
    ]);
    return result?.choices?.[0]?.message?.content || buildFallbackNarrative(question, targetCol, stats, findings, mlSummary);
  } catch {
    return buildFallbackNarrative(question, targetCol, stats, findings, mlSummary);
  }
};

const buildFallbackNarrative = (question, metric, stats, findings, mlSummary) => {
  if (!metric || !stats) return `Analysis of "${question}" requires numeric data. Ensure a numeric column is present in the dataset.`;

  const high = findings.filter(f => f.severity === 'high');
  const med = findings.filter(f => f.severity === 'medium');

  let text = `Root Cause Analysis: "${question}"\n\n`;
  text += `Key Metric: ${metric} · Range: ${stats.min} – ${stats.max} · Mean: ${stats.mean} · Std Dev: ${stats.std}\n\n`;

  if (mlSummary && mlSummary.anomalies_found > 0) {
    text += `Multi-Method Detection found ${mlSummary.anomalies_found} anomalous records (${mlSummary.anomaly_rate}% of data) using Z-score, IQR, Isolation Forest, and DBSCAN. `;
    text += `${mlSummary.high_confidence || 0} records flagged with high confidence (≥75% method agreement).\n\n`;
  }

  if (high.length > 0) {
    text += `High-Priority Findings: ${high.map(f => f.title).join('; ')}.\n\n`;
  }
  if (med.length > 0) {
    text += `Contributing Factors: ${med.map(f => f.title).join('; ')}.\n\n`;
  }
  if (findings.length === 0 && (!mlSummary || mlSummary.anomalies_found === 0)) {
    text += `No statistically significant anomalies detected. The metric appears within expected ranges. Consider expanding the time window, comparing against an external benchmark, or checking upstream data sources.`;
  }

  return text;
};

// ── Build recommended SQL queries ────────────────────────────────────────────
const buildSuggestedQueries = (targetCol, mentionedCols, categoricalCols, intent) => {
  const queries = [];
  if (!targetCol) return queries;

  queries.push({
    label: `Distribution of ${targetCol}`,
    sql: `SELECT MIN("${targetCol}") as min_val, MAX("${targetCol}") as max_val, AVG("${targetCol}") as avg_val, STDDEV("${targetCol}") as std_dev, COUNT(*) as total FROM dataset`,
  });

  if (mentionedCols.length > 1) {
    queries.push({
      label: `Compare ${mentionedCols[0]} vs ${mentionedCols[1]}`,
      sql: `SELECT "${mentionedCols[0]}", "${mentionedCols[1]}", COUNT(*) as count FROM dataset GROUP BY "${mentionedCols[0]}", "${mentionedCols[1]}" ORDER BY count DESC LIMIT 20`,
    });
  }

  if (intent.isAnomalyQuestion || intent.isDropQuestion) {
    queries.push({
      label: `Outlier rows in ${targetCol} (beyond 3σ)`,
      sql: `WITH stats AS (SELECT AVG("${targetCol}") as m, STDDEV("${targetCol}") as s FROM dataset)\nSELECT * FROM dataset, stats WHERE ABS("${targetCol}" - m) > 3 * s ORDER BY ABS("${targetCol}" - m) DESC LIMIT 50`,
    });
  }

  if (intent.isTrendQuestion) {
    queries.push({
      label: `${targetCol} trend over time`,
      sql: `SELECT DATE_TRUNC('month', created_at::date) as period, AVG("${targetCol}") as avg_value, COUNT(*) as volume FROM dataset GROUP BY period ORDER BY period`,
    });
  }

  categoricalCols.slice(0, 2).forEach(cat => {
    queries.push({
      label: `${targetCol} by ${cat}`,
      sql: `SELECT "${cat}", AVG("${targetCol}") as avg_value, STDDEV("${targetCol}") as std_dev, COUNT(*) as count FROM dataset GROUP BY "${cat}" ORDER BY avg_value DESC LIMIT 15`,
    });
  });

  queries.push({
    label: `Top 10 highest ${targetCol} records`,
    sql: `SELECT * FROM dataset ORDER BY "${targetCol}" DESC LIMIT 10`,
  });

  return queries;
};

// ── Build recommendations (intent-aware) ────────────────────────────────────
const buildRecommendations = (intent, findings, targetCol, mlSummary) => {
  const recs = [];

  if (mlSummary?.anomalies_found > 0) {
    const highConf = mlSummary.high_confidence || 0;
    if (highConf > 0) {
      recs.push(`${highConf} records flagged by ≥3 detection methods with high confidence — investigate these rows for data quality issues, fraudulent entries, or genuine business events.`);
    }
    const topCol = Object.entries(mlSummary.column_anomaly_counts || {}).sort((a, b) => b[1] - a[1])[0];
    if (topCol) recs.push(`"${topCol[0]}" has the most anomalous values (${topCol[1]} flagged) — audit this column's data pipeline for ingestion errors or upstream source changes.`);
  }

  if (intent.isDropQuestion || intent.isWhyQuestion) {
    if (findings.some(f => f.type === 'outliers')) recs.push(`Investigate the ${findings.find(f => f.type === 'outliers')?.title?.match(/\d+/)?.[0] || ''} outlier records — they may be masking the true trend. Consider filtering or winsorizing before aggregation.`);
    const negCorr = findings.find(f => f.type === 'correlation' && f.correlation < -0.5);
    if (negCorr) recs.push(`"${negCorr.metric}" has a strong negative relationship with "${targetCol}" (r=${negCorr.correlation?.toFixed(2)}) — this variable likely explains the drop. Drill into segment-level breakdowns.`);
    recs.push(`Segment data by categorical dimensions and compare the ${targetCol} distribution across each segment to isolate where the anomaly is concentrated.`);
    recs.push(`Compare current period vs previous period with a time-based query to confirm whether this is a step-change or a gradual trend.`);
  }

  if (intent.isAnomalyQuestion) {
    recs.push('Cross-reference flagged rows with upstream data sources (ETL logs, API feeds, manual entry systems) to identify the root cause of data quality issues.');
    recs.push('Set up a threshold-based webhook alert to notify your team automatically when the anomaly rate exceeds 5%.');
  }

  if (intent.isTrendQuestion) {
    recs.push(`Use the Forecasting module to model ${targetCol} over time and detect structural breaks — particularly useful if the trend changed after a specific event.`);
    recs.push('Segment trends by category to confirm whether the pattern is uniform across all groups or driven by one outlier segment.');
  }

  if (intent.isGrowthQuestion || intent.isWhatQuestion) {
    const corrFinding = findings.find(f => f.type === 'correlation');
    if (corrFinding) recs.push(`"${corrFinding.metric}" shows the strongest relationship with "${targetCol}" (r=${corrFinding.correlation?.toFixed(2)}) — prioritize this variable in your growth model.`);
    recs.push(`Apply the AutoML module to automatically discover which features have the largest impact on ${targetCol} across the full feature set.`);
  }

  if (intent.isCompareQuestion) {
    recs.push(`Use the Pivot Table to compare ${targetCol} across multiple dimensions simultaneously — group by two categorical variables to find the combination driving the most variance.`);
  }

  return recs.slice(0, 5);
};

// ── Core analysis engine ─────────────────────────────────────────────────────
const analyzeRootCause = async (question, datasetId) => {
  // 1. Fetch data
  const [dataResult, datasetMeta] = await Promise.all([
    pool.query(`SELECT * FROM data_${datasetId} LIMIT 5000`),
    pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]),
  ]);

  const rows = dataResult.rows.map(r => { const { row_index, ...rest } = r; return rest; });
  if (!rows.length) return { error: 'No data' };

  const ds = datasetMeta.rows[0];
  const governance = ds ? {
    name: ds.name,
    version: '1.0',
    row_count: ds.row_count || rows.length,
    imported: ds.created_at ? new Date(ds.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown',
    dataset_id: datasetId,
    checksum: ds.checksum || null,
    source_type: ds.source_type || 'uploaded',
  } : null;

  const summary = computeFullSummary(rows);
  const correlation = computeCorrelationMatrix(rows);
  const cols = Object.keys(rows[0]);
  const numericCols = cols.filter(c => summary[c]?.type === 'numeric');
  const categoricalCols = cols.filter(c => summary[c]?.type === 'categorical');

  const q = question.toLowerCase();
  const isDropQuestion = /drop|declin|decreas|fell|lower|reduc|down/i.test(q);
  const isGrowthQuestion = /grow|increas|rise|up|higher|improv/i.test(q);
  const isAnomalyQuestion = /anomaly|anomalies|outlier|spike|unusual|weird|strange/i.test(q);
  const isTrendQuestion = /trend|over time|period|quarter|month|week/i.test(q);
  const isCompareQuestion = /compar|versus|vs|between|difference/i.test(q);
  const isWhyQuestion = /why|reason|cause|root|explain/i.test(q);
  const isWhatQuestion = /what|which|top|best|worst/i.test(q);
  const intent = { isDropQuestion, isGrowthQuestion, isAnomalyQuestion, isTrendQuestion, isCompareQuestion, isWhyQuestion, isWhatQuestion };

  const mentionedCols = cols.filter(c => q.includes(c.toLowerCase().replace(/_/g, ' ')) || q.includes(c.toLowerCase()));
  const mentionedNumeric = mentionedCols.filter(c => numericCols.includes(c));
  const targetCol = mentionedNumeric[0] || numericCols[0];
  const targetStats = targetCol ? summary[targetCol] : null;

  // 2. Run multi-method ML anomaly detection + JS statistical detection in parallel
  const [mlResult] = await Promise.all([
    numericCols.length > 0 ? runMultiMethodAnomalyDetection(rows.slice(0, 3000), numericCols.slice(0, 8), targetCol) : Promise.resolve(null),
  ]);

  // 3. JS-side statistical findings
  let findings = jsSideDetection(rows, targetCol, targetStats);

  // 4. Add correlation findings
  if (correlation.columns?.length > 1 && targetCol) {
    const corrs = correlation.columns
      .filter(c => c !== targetCol)
      .map(c => ({ col: c, r: correlation.matrix?.[targetCol]?.[c] || 0 }))
      .filter(x => Math.abs(x.r) > 0.4)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    corrs.slice(0, 2).forEach(({ col, r }) => {
      findings.push({
        type: 'correlation',
        severity: Math.abs(r) > 0.7 ? 'high' : 'medium',
        confidence: Math.min(1, (Math.abs(r) - 0.4) / 0.6),
        title: `${r > 0 ? 'Positive' : 'Negative'} correlation: "${col}" ↔ "${targetCol}" (r=${r.toFixed(2)})`,
        detail: `Pearson r = ${r.toFixed(2)}. Changes in "${col}" explain ${(r * r * 100).toFixed(0)}% of variance in "${targetCol}". This ${r > 0 ? 'co-movement' : 'inverse relationship'} is statistically significant.`,
        metric: col,
        correlation: r,
        method: 'Pearson',
      });
    });
  }

  // 5. Promote ML anomaly findings into the findings list
  const mlSummary = mlResult?.summary || null;
  if (mlSummary && mlSummary.anomalies_found > 0) {
    findings.unshift({
      type: 'ml_anomalies',
      severity: mlSummary.anomaly_rate > 10 ? 'high' : 'medium',
      confidence: Math.min(1, mlSummary.high_confidence / Math.max(1, mlSummary.anomalies_found)),
      title: `${mlSummary.anomalies_found} anomalous records detected (${mlSummary.anomaly_rate}% of data)`,
      detail: `4 methods ran in parallel — Z-score flagged ${mlSummary.methods_agreement?.zscore_flagged || 0}, IQR flagged ${mlSummary.methods_agreement?.iqr_flagged || 0}, Isolation Forest flagged ${mlSummary.methods_agreement?.isolation_forest_flagged || 0}, DBSCAN flagged ${mlSummary.methods_agreement?.dbscan_flagged || 0}. ${mlSummary.high_confidence || 0} records confirmed by ≥3 methods.`,
      metric: targetCol,
      method: 'Multi-Method ML',
      mlSummary,
    });
  }

  // Sort by severity + confidence
  const sev = { high: 3, medium: 2, low: 1 };
  findings.sort((a, b) => (sev[b.severity] - sev[a.severity]) || (b.confidence - a.confidence));

  // 6. Build recommendations + queries
  const recommendations = buildRecommendations(intent, findings, targetCol, mlSummary);
  const suggestedQueries = buildSuggestedQueries(targetCol, mentionedCols, categoricalCols, intent);

  // 7. AI narrative via Groq
  const narrative = await buildGroqNarrative(question, targetCol, targetStats, findings, mlSummary, governance);

  // 8. Fetch lineage info (non-blocking)
  let lineage = null;
  try {
    const lin = await pool.query('SELECT * FROM lineage WHERE dataset_id=$1 ORDER BY created_at DESC LIMIT 1', [datasetId]);
    if (lin.rows.length) lineage = { event: lin.rows[0].event_type, timestamp: lin.rows[0].created_at, actor: lin.rows[0].actor };
  } catch {}

  return {
    question,
    targetMetric: targetCol,
    intent,
    findings,
    recommendations,
    suggestedQueries,
    narrative,
    anomalyData: mlResult ? {
      series: mlResult.series,
      anomalies: mlResult.anomalies,
      summary: mlSummary,
      colStats: mlResult.col_stats,
      numericCols: mlResult.numeric_cols,
      chartColumn: mlSummary?.chart_column || targetCol,
    } : null,
    governance,
    lineage,
    dataOverview: {
      rows: rows.length,
      numericColumns: numericCols.length,
      categoricalColumns: categoricalCols.length,
      columns: cols.length,
    },
  };
};

// ── Routes ───────────────────────────────────────────────────────────────────
const handleAnalyze = async (req, res) => {
  try {
    const { question, datasetId, dataset_id } = req.body;
    const dsId = datasetId || dataset_id;
    if (!question) return res.status(400).json({ error: 'Question required' });
    if (!dsId) return res.status(400).json({ error: 'Dataset required' });
    const analysis = await analyzeRootCause(question, dsId);
    await pool.query(
      'INSERT INTO business_questions (user_id, dataset_id, question, result) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [req.user.id, dsId, question, JSON.stringify(analysis)]
    ).catch(() => {});
    res.json(analysis);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

router.post('/', authenticate, handleAnalyze);
router.post('/answer', authenticate, handleAnalyze);
router.post('/analyze', authenticate, handleAnalyze);

router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM business_questions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/suggestions/:datasetId', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    const schema = ds.rows[0].schema || {};
    const cols = Object.keys(schema);
    const numCols = cols.filter(c => ['numeric', 'float', 'integer', 'number'].includes(schema[c]));
    const catCols = cols.filter(c => ['text', 'varchar', 'string', 'categorical'].includes(schema[c]));
    const suggestions = [
      `Why are there anomalies in ${numCols[0] || 'the main metric'}?`,
      `What are the top drivers of ${numCols[1] || numCols[0] || 'performance'}?`,
      `Which ${catCols[0] || 'category'} has the highest ${numCols[0] || 'value'}?`,
      `How does ${numCols[0] || 'metric A'} correlate with ${numCols[1] || 'metric B'}?`,
      `What caused the drop in ${numCols[0] || 'revenue'}?`,
      `Which segments are underperforming this period?`,
      `Where are the outliers in this dataset?`,
      `What are the top 5 ${catCols[0] || 'categories'} by ${numCols[0] || 'value'}?`,
    ];
    res.json(suggestions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
