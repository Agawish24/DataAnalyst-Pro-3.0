const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { computeFullSummary, computeCorrelationMatrix } = require('../helpers/statsHelper');

const router = express.Router();

// Root-cause analysis engine
const analyzeRootCause = async (question, datasetId) => {
  const data = await pool.query(`SELECT * FROM data_${datasetId} LIMIT 5000`);
  const rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
  if (!rows.length) return { error: 'No data' };

  const summary = computeFullSummary(rows);
  const correlation = computeCorrelationMatrix(rows);
  const cols = Object.keys(rows[0]);
  const numericCols = cols.filter(c => summary[c]?.type === 'numeric');

  const q = question.toLowerCase();

  // Detect intent
  const isDropQuestion = /drop|declin|decreas|fell|lower|reduc|down/i.test(q);
  const isGrowthQuestion = /grow|increas|rise|up|higher|improv/i.test(q);
  const isAnomalyQuestion = /anomaly|anomalies|outlier|spike|unusual|weird/i.test(q);
  const isTrendQuestion = /trend|over time|period|quarter|month|week/i.test(q);
  const isCompareQuestion = /compar|versus|vs|between|difference/i.test(q);
  const isWhyQuestion = /why|reason|cause|root|explain/i.test(q);
  const isWhatQuestion = /what|which|top|best|worst/i.test(q);

  // Extract target metric from question
  const mentionedCols = cols.filter(c => q.includes(c.toLowerCase().replace(/_/g, ' ')) || q.includes(c.toLowerCase()));
  const targetCol = mentionedCols[0] || numericCols[0];
  const targetStats = targetCol ? summary[targetCol] : null;

  const findings = [];
  const recommendations = [];
  const queries = [];

  if (targetCol && targetStats) {
    // Outlier detection
    if (targetStats.outliers?.length > 0) {
      findings.push({
        type: 'outliers',
        severity: 'high',
        title: `${targetStats.outliers.length} outliers found in "${targetCol}"`,
        detail: `Values outside normal range: ${targetStats.outliers.slice(0, 5).join(', ')}. These may be driving abnormal results.`,
        metric: targetCol,
      });
    }

    // Correlation insights
    if (correlation.columns?.length > 1) {
      const corrs = correlation.columns
        .filter(c => c !== targetCol)
        .map(c => ({ col: c, r: correlation.matrix?.[targetCol]?.[c] || 0 }))
        .filter(x => Math.abs(x.r) > 0.4)
        .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

      corrs.slice(0, 3).forEach(({ col, r }) => {
        findings.push({
          type: 'correlation',
          severity: Math.abs(r) > 0.7 ? 'high' : 'medium',
          title: `Strong ${r > 0 ? 'positive' : 'negative'} correlation: "${col}" ↔ "${targetCol}"`,
          detail: `Pearson r = ${r.toFixed(2)}. Changes in "${col}" explain ${(r*r*100).toFixed(0)}% of variance in "${targetCol}".`,
          metric: col,
          correlation: r,
        });
      });
    }

    // Distribution skew
    if (Math.abs(targetStats.skewness || 0) > 1) {
      findings.push({
        type: 'distribution',
        severity: 'medium',
        title: `"${targetCol}" is ${targetStats.skewness > 0 ? 'right' : 'left'}-skewed (skewness=${targetStats.skewness})`,
        detail: `The distribution is not normal. Mean (${targetStats.mean}) is ${targetStats.skewness > 0 ? 'above' : 'below'} median (${targetStats.median}), indicating outliers pulling the average.`,
        metric: targetCol,
      });
    }

    // Missing values
    const missingPct = ((rows.length - (targetStats.count || rows.length)) / rows.length * 100);
    if (missingPct > 5) {
      findings.push({
        type: 'missing_data',
        severity: missingPct > 20 ? 'high' : 'medium',
        title: `${missingPct.toFixed(1)}% of "${targetCol}" values are missing`,
        detail: `Missing values may be causing gaps in analysis and biasing results downward.`,
        metric: targetCol,
      });
    }

    // Suggested SQL queries
    queries.push({
      label: `Distribution of ${targetCol}`,
      sql: `SELECT MIN("${targetCol}") as min_val, MAX("${targetCol}") as max_val, AVG("${targetCol}") as avg_val, COUNT(*) as total FROM dataset`,
    });

    if (mentionedCols.length > 1) {
      queries.push({
        label: `Compare ${mentionedCols[0]} vs ${mentionedCols[1]}`,
        sql: `SELECT "${mentionedCols[0]}", "${mentionedCols[1]}", COUNT(*) as count FROM dataset GROUP BY "${mentionedCols[0]}", "${mentionedCols[1]}" ORDER BY count DESC LIMIT 20`,
      });
    }

    if (isDropQuestion || isGrowthQuestion) {
      queries.push({
        label: `Top/Bottom values in ${targetCol}`,
        sql: `SELECT * FROM dataset ORDER BY "${targetCol}" DESC LIMIT 10`,
      });
    }

    // Recommendations
    if (isDropQuestion || isWhyQuestion) {
      if (findings.some(f => f.type === 'outliers')) recommendations.push('Investigate and potentially remove outlier records that may be distorting aggregate metrics.');
      if (findings.some(f => f.type === 'correlation' && f.correlation < -0.5)) {
        const neg = findings.find(f => f.type === 'correlation' && f.correlation < -0.5);
        recommendations.push(`"${neg?.metric}" has a strong negative relationship with "${targetCol}" — investigate whether this variable is the root cause.`);
      }
      recommendations.push(`Segment the data by categorical dimensions and check if the drop is isolated to a specific group.`);
      recommendations.push(`Compare current period vs previous period using a time-based SQL query.`);
    }
    if (isAnomalyQuestion) {
      recommendations.push('Run the ML Outlier Detection module to identify and classify anomalous records.');
      recommendations.push('Check for data ingestion issues or upstream pipeline failures that may have introduced bad data.');
    }
    if (isTrendQuestion) {
      recommendations.push('Use the Forecasting module to model this metric over time and detect structural breaks.');
      recommendations.push('Segment trends by category to identify if the trend is uniform or driven by one segment.');
    }
    if (isWhatQuestion || isCompareQuestion || isGrowthQuestion) {
      if (findings.some(f => f.type === 'correlation')) {
        const top = findings.find(f => f.type === 'correlation');
        recommendations.push(`"${top?.metric}" shows the strongest relationship with "${targetCol}" — prioritize this variable in your analysis.`);
      }
      recommendations.push(`Segment the data by each categorical dimension to identify which group drives the most variance in "${targetCol}".`);
      recommendations.push(`Run the Prescriptive Analytics module to get AI-driven optimization recommendations for "${targetCol}".`);
      if (targetStats?.type === 'categorical') {
        recommendations.push(`Use the Classification ML model to predict "${targetCol}" and rank feature importance across all available columns.`);
        recommendations.push(`Compare "${targetCol}" distributions across departments and performance bands to isolate the primary driver.`);
      } else {
        recommendations.push(`Apply regression analysis to quantify which features have the largest linear impact on "${targetCol}".`);
      }
    }
  }

  // Categorical breakdowns
  const categoricalCols = cols.filter(c => summary[c]?.type === 'categorical');
  categoricalCols.slice(0, 2).forEach(cat => {
    if (targetCol) {
      queries.push({
        label: `${targetCol} by ${cat}`,
        sql: `SELECT "${cat}", AVG("${targetCol}") as avg_value, COUNT(*) as count FROM dataset GROUP BY "${cat}" ORDER BY avg_value DESC LIMIT 15`,
      });
    }
  });

  // Summary narrative
  const narrative = buildNarrative(question, targetCol, targetStats, findings, isDropQuestion, isGrowthQuestion);

  return {
    question,
    targetMetric: targetCol,
    intent: { isDropQuestion, isGrowthQuestion, isAnomalyQuestion, isTrendQuestion, isCompareQuestion, isWhyQuestion, isWhatQuestion },
    findings: findings.sort((a, b) => (b.severity === 'high' ? 1 : 0) - (a.severity === 'high' ? 1 : 0)),
    recommendations,
    suggestedQueries: queries,
    narrative,
    dataOverview: { rows: rows.length, numericColumns: numericCols.length, categoricalColumns: categoricalCols.length },
  };
};

const buildNarrative = (question, metric, stats, findings, isDrop, isGrowth) => {
  if (!metric || !stats) return `Analysis of "${question}" requires numeric data in the dataset.`;

  const highFindings = findings.filter(f => f.severity === 'high');
  const medFindings = findings.filter(f => f.severity === 'medium');

  let text = `## Root Cause Analysis: "${question}"\n\n`;
  text += `### Key Metric: ${metric}\n`;
  text += `Current range: **${stats.min} – ${stats.max}** | Mean: **${stats.mean}** | Std Dev: **${stats.std}**\n\n`;

  if (highFindings.length > 0) {
    text += `### High-Priority Findings\n`;
    highFindings.forEach(f => { text += `- **${f.title}**: ${f.detail}\n`; });
    text += '\n';
  }
  if (medFindings.length > 0) {
    text += `### Contributing Factors\n`;
    medFindings.forEach(f => { text += `- ${f.title}: ${f.detail}\n`; });
    text += '\n';
  }
  if (findings.length === 0) {
    text += `No statistically significant anomalies were detected. The metric appears within expected ranges. Consider:\n- Expanding the time window of analysis\n- Comparing against an external benchmark\n- Checking upstream data sources\n\n`;
  }

  return text;
};

// Save question history
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM business_questions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/answer', authenticate, async (req, res) => {
  try {
    const { question, dataset_id } = req.body;
    if (!question) return res.status(400).json({ error: 'Question required' });
    if (!dataset_id) return res.status(400).json({ error: 'Dataset required' });
    const analysis = await analyzeRootCause(question, dataset_id);
    await pool.query(
      'INSERT INTO business_questions (user_id, dataset_id, question, result) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [req.user.id, dataset_id, question, JSON.stringify(analysis)]
    ).catch(() => {});
    res.json(analysis);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { question, dataset_id } = req.body;
    if (!question) return res.status(400).json({ error: 'Question required' });
    if (!dataset_id) return res.status(400).json({ error: 'Dataset required' });

    const analysis = await analyzeRootCause(question, dataset_id);

    // Save to history
    await pool.query(
      'INSERT INTO business_questions (user_id, dataset_id, question, result) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [req.user.id, dataset_id, question, JSON.stringify(analysis)]
    ).catch(() => {});

    res.json(analysis);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quick suggestions for a dataset
router.get('/suggestions/:datasetId', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    const schema = ds.rows[0].schema || {};
    const cols = Object.keys(schema);
    const numCols = cols.filter(c => schema[c] === 'numeric' || schema[c] === 'float' || schema[c] === 'integer');
    const catCols = cols.filter(c => schema[c] === 'text' || schema[c] === 'varchar');

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
