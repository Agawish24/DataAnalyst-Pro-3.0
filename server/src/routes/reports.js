const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { computeFullSummary } = require('../helpers/statsHelper');
const { getDataQuality } = require('../helpers/dataClean');

const router = express.Router();

// Generate an AI narrative summary
const generateNarrative = (profile) => {
  if (!profile) return 'No profile data available.';
  const o = profile.overview || {};
  const cols = profile.columns || {};
  const numCols = Object.entries(cols).filter(([,v]) => v.type === 'numeric');
  const catCols = Object.entries(cols).filter(([,v]) => v.type === 'categorical');

  let narrative = `## Dataset Overview\n\nThis dataset contains **${o.rowCount?.toLocaleString()} rows** and **${o.columnCount} columns** `;
  narrative += `(${o.numericColumns} numeric, ${o.categoricalColumns} categorical).\n\n`;

  if (o.missingPct > 0) {
    narrative += `### Data Quality\n**${o.missingPct}%** of values are missing across the dataset. `;
    narrative += o.duplicates > 0 ? `Additionally, **${o.duplicates} duplicate rows** were detected.\n\n` : '\n\n';
  } else {
    narrative += `### Data Quality\nThe dataset has **no missing values** — excellent data quality!\n\n`;
  }

  if (numCols.length > 0) {
    narrative += `### Numeric Columns\n`;
    numCols.slice(0, 5).forEach(([name, info]) => {
      narrative += `- **${name}**: ranges from ${info.min} to ${info.max}, mean = ${info.mean}, std = ${info.std}`;
      if (info.outliers?.length > 0) narrative += ` (${info.outliers.length} outliers detected)`;
      narrative += '\n';
    });
    narrative += '\n';
  }

  if (catCols.length > 0) {
    narrative += `### Categorical Columns\n`;
    catCols.slice(0, 5).forEach(([name, info]) => {
      narrative += `- **${name}**: ${info.unique} unique values`;
      if (info.topValues?.[0]) narrative += `, most common = "${info.topValues[0].value}" (${info.topValues[0].count} occurrences)`;
      narrative += '\n';
    });
    narrative += '\n';
  }

  narrative += `*Report generated on ${new Date().toLocaleString()}*`;
  return narrative;
};

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, d.name as dataset_name, u.name as creator_name FROM reports r
       LEFT JOIN datasets d ON r.dataset_id=d.id LEFT JOIN users u ON r.created_by=u.id
       ORDER BY r.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const generateReport = async (req, res) => {
  try {
    const { name, dataset_id, dashboard_id, report_type = 'summary', include_sections = ['overview', 'quality', 'statistics', 'correlation'] } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    let profile = null, narrativeText = '';
    if (dataset_id) {
      const cached = await pool.query('SELECT * FROM data_profiles WHERE dataset_id=$1 ORDER BY generated_at DESC LIMIT 1', [dataset_id]);
      if (cached.rows.length) {
        profile = cached.rows[0].profile_data;
      } else {
        const data = await pool.query(`SELECT * FROM data_${dataset_id} LIMIT 5000`);
        const rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
        const summary = computeFullSummary(rows);
        const quality = getDataQuality(rows);
        profile = { overview: { rowCount: rows.length, columnCount: Object.keys(rows[0] || {}).length }, columns: summary, quality };
      }
      narrativeText = generateNarrative(profile);
    }

    const result = await pool.query(
      'INSERT INTO reports (name, dataset_id, dashboard_id, report_type, config, ai_narrative, created_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, dataset_id || null, dashboard_id || null, report_type, JSON.stringify({ include_sections }), narrativeText, req.user.id, 'ready']
    );

    res.status(201).json({ ...result.rows[0], profile });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

router.post('/', authenticate, async (req, res) => {
  if (!req.body.name && req.body.title) req.body.name = req.body.title;
  return generateReport(req, res);
});
router.post('/generate', authenticate, generateReport);

router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, d.name as dataset_name FROM reports r LEFT JOIN datasets d ON r.dataset_id=d.id WHERE r.id=$1 AND r.created_by=$2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM reports WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
