const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const computeStats = (rows, col) => {
  const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const n = vals.length;
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const q1 = vals[Math.floor(n * 0.25)];
  const median = vals[Math.floor(n * 0.5)];
  const q3 = vals[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const outliers = vals.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
  const trend = vals.slice(-20).reduce((acc, v, i, arr) => i === 0 ? 0 : acc + (v - arr[i - 1]), 0);
  return {
    count: n, mean: parseFloat(mean.toFixed(2)), median,
    min: vals[0], max: vals[n - 1], std: parseFloat(Math.sqrt(variance).toFixed(2)),
    q1, q3, outlierCount: outliers.length,
    trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
    trendMagnitude: parseFloat(Math.abs(trend / n).toFixed(2)),
  };
};

const computeCategorySummary = (rows, col) => {
  const counts = {};
  rows.forEach(r => {
    const v = r[col] || 'Unknown';
    counts[v] = (counts[v] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    unique: sorted.length,
    topValue: sorted[0]?.[0],
    topCount: sorted[0]?.[1],
    topPct: parseFloat(((sorted[0]?.[1] || 0) / rows.length * 100).toFixed(1)),
    distribution: sorted.slice(0, 8).map(([v, c]) => ({ value: v, count: c, pct: parseFloat((c / rows.length * 100).toFixed(1)) })),
  };
};

const detectTimeColumn = (schema) => schema.find(c => /date|time|day|month|year|period/i.test(c.name) && c.type === 'text')?.name;
const detectNumericCols = (schema) => schema.filter(c => c.type === 'numeric').map(c => c.name);
const detectCatCols = (schema) => schema.filter(c => c.type === 'text').map(c => c.name);

const generateNarrative = (ds, schema, rows, numStats, catStats, timeCol) => {
  const numCols = detectNumericCols(schema);
  const catCols = detectCatCols(schema);
  const primaryMetric = numCols.find(c => /revenue|sales|profit|amount|value|salary|score/i.test(c)) || numCols[0];
  const primaryStats = primaryMetric ? numStats[primaryMetric] : null;

  const sections = [];

  // Executive Summary
  const summaryParts = [
    `This dataset contains **${rows.length.toLocaleString()} records** across **${schema.length} dimensions**`,
    numCols.length > 0 ? `${numCols.length} numeric` : null,
    catCols.length > 0 ? `${catCols.length} categorical column${catCols.length > 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  let execSummary = summaryParts.join(', ') + '.';

  if (primaryStats) {
    const metric = primaryMetric.replace(/_/g, ' ');
    execSummary += ` The primary metric **${metric}** ranges from ${primaryStats.min.toLocaleString()} to ${primaryStats.max.toLocaleString()}, with an average of ${primaryStats.mean.toLocaleString()}.`;
    if (primaryStats.outlierCount > 0) {
      execSummary += ` **${primaryStats.outlierCount} outlier${primaryStats.outlierCount > 1 ? 's' : ''}** were detected that may require attention.`;
    }
    if (primaryStats.trend !== 'stable') {
      execSummary += ` The recent trend shows a **${primaryStats.trend}** pattern in ${metric}.`;
    }
  }

  sections.push({ id: 'executive_summary', title: '🎯 Executive Summary', content: execSummary, type: 'paragraph' });

  // Key Metrics
  const metricsFindings = [];
  numCols.slice(0, 6).forEach(col => {
    const s = numStats[col];
    if (!s) return;
    const name = col.replace(/_/g, ' ');
    let insight = `**${name}**: avg ${s.mean.toLocaleString()} (range: ${s.min.toLocaleString()}–${s.max.toLocaleString()})`;
    if (s.trend !== 'stable') insight += ` · trend: ${s.trend}`;
    if (s.outlierCount > 0) insight += ` · ⚠️ ${s.outlierCount} outliers`;
    metricsFindings.push(insight);
  });

  if (metricsFindings.length > 0) {
    sections.push({ id: 'key_metrics', title: '📊 Key Metrics', content: metricsFindings, type: 'bullets' });
  }

  // Categorical Insights
  const catFindings = [];
  catCols.slice(0, 5).forEach(col => {
    const s = catStats[col];
    if (!s) return;
    const name = col.replace(/_/g, ' ');
    catFindings.push(`**${name}**: ${s.unique} distinct values · top: "${s.topValue}" (${s.topPct}% of records)`);
  });

  if (catFindings.length > 0) {
    sections.push({ id: 'categorical_breakdown', title: '🏷️ Categorical Breakdown', content: catFindings, type: 'bullets' });
  }

  // Distribution Analysis
  const distFindings = [];
  numCols.slice(0, 4).forEach(col => {
    const s = numStats[col];
    if (!s) return;
    const name = col.replace(/_/g, ' ');
    const skew = s.mean > s.median ? 'right-skewed (high outliers pulling up average)' : s.mean < s.median ? 'left-skewed' : 'roughly symmetric';
    const spread = (s.max - s.min) !== 0 ? ((s.std / (s.max - s.min)) * 100).toFixed(0) : 0;
    distFindings.push(`**${name}** is ${skew} · std deviation: ${s.std.toLocaleString()} (${spread}% of range)`);
  });

  if (distFindings.length > 0) {
    sections.push({ id: 'distributions', title: '📉 Data Distributions', content: distFindings, type: 'bullets' });
  }

  // Data Quality
  const qualityIssues = [];
  const totalCells = rows.length * schema.length;
  let nullCount = 0;
  schema.forEach(col => {
    const missing = rows.filter(r => r[col.name] === null || r[col.name] === '' || r[col.name] === undefined).length;
    nullCount += missing;
    if (missing > rows.length * 0.01) {
      qualityIssues.push(`**${col.name.replace(/_/g, ' ')}**: ${missing} missing values (${(missing / rows.length * 100).toFixed(1)}%)`);
    }
  });

  const completeness = ((1 - nullCount / totalCells) * 100).toFixed(1);
  const qualitySummary = `Data completeness: **${completeness}%**` + (qualityIssues.length === 0 ? ' — no significant missing values detected.' : '');
  sections.push({
    id: 'data_quality',
    title: '✅ Data Quality',
    content: qualityIssues.length > 0 ? [qualitySummary, ...qualityIssues] : qualitySummary,
    type: qualityIssues.length > 0 ? 'bullets' : 'paragraph',
  });

  // Recommendations
  const recs = [];

  numCols.forEach(col => {
    const s = numStats[col];
    if (!s) return;
    const name = col.replace(/_/g, ' ');
    if (s.outlierCount > rows.length * 0.05) recs.push(`Investigate and potentially clean **${s.outlierCount} outliers** in ${name} — they represent ${(s.outlierCount / rows.length * 100).toFixed(1)}% of records`);
    if (s.trend === 'decreasing' && /revenue|sales|profit/i.test(col)) recs.push(`**${name}** shows a declining trend — root cause analysis recommended`);
    if (s.trend === 'increasing' && /cost|expense|return|churn/i.test(col)) recs.push(`**${name}** is increasing — review for cost control opportunities`);
  });

  const highMissingCols = schema.filter(col => {
    const missing = rows.filter(r => !r[col.name] && r[col.name] !== 0).length;
    return missing > rows.length * 0.1;
  });
  if (highMissingCols.length > 0) {
    recs.push(`Apply imputation or remove records with missing data in: ${highMissingCols.map(c => `**${c.name}**`).join(', ')}`);
  }

  if (catCols.some(c => /region|territory|area/i.test(c)) && numCols.length > 0) {
    recs.push('Perform geographic segmentation analysis — segment numeric metrics by region/territory for deeper insights');
  }

  if (rows.length > 1000) {
    recs.push(`With ${rows.length.toLocaleString()} records, consider applying **clustering** to discover natural customer/product segments`);
  }

  if (recs.length === 0) recs.push('Dataset appears well-structured. Consider enriching with external data sources for deeper cross-analysis.');

  sections.push({ id: 'recommendations', title: '💡 Recommendations', content: recs, type: 'bullets' });

  return sections;
};

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT n.*, d.name as dataset_name FROM narratives n LEFT JOIN datasets d ON n.dataset_id = d.id WHERE n.created_by = $1 ORDER BY n.created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:datasetId', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1 AND uploaded_by=$2', [req.params.datasetId, req.user.id]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const dataset = ds.rows[0];
    const schema = Array.isArray(dataset.schema) ? dataset.schema : [];
    const rowsResult = await pool.query(`SELECT * FROM "data_${dataset.id}" LIMIT 5000`);
    const rows = rowsResult.rows.map(r => { const { row_index, ...rest } = r; return rest; });

    if (!rows.length) return res.status(400).json({ error: 'Dataset has no data' });

    const numCols = detectNumericCols(schema);
    const catCols = detectCatCols(schema);
    const timeCol = detectTimeColumn(schema);

    const numStats = {};
    numCols.forEach(col => { numStats[col] = computeStats(rows, col); });

    const catStats = {};
    catCols.forEach(col => { catStats[col] = computeCategorySummary(rows, col); });

    const narrative = generateNarrative(dataset, schema, rows, numStats, catStats, timeCol);

    const saved = await pool.query(
      'INSERT INTO narratives (dataset_id, title, content, created_by) VALUES ($1,$2,$3,$4) RETURNING id, created_at',
      [dataset.id, `Analysis: ${dataset.name}`, JSON.stringify(narrative), req.user.id]
    );

    res.json({
      id: saved.rows[0].id,
      datasetId: dataset.id,
      datasetName: dataset.name,
      generatedAt: saved.rows[0].created_at,
      sections: narrative,
      stats: {
        rowCount: rows.length,
        numericColumns: numCols.length,
        categoricalColumns: catCols.length,
        hasTimeData: !!timeCol,
      },
      numStats, catStats,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT n.id, n.title, n.created_at, d.name as dataset_name, d.id as dataset_id
       FROM narratives n JOIN datasets d ON n.dataset_id=d.id
       ORDER BY n.created_at DESC LIMIT 20`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT n.*, d.name as dataset_name FROM narratives n JOIN datasets d ON n.dataset_id=d.id WHERE n.id=$1 AND n.created_by=$2',
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ...r.rows[0], sections: r.rows[0].content });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM narratives WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
