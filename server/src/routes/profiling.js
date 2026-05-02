const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { computeFullSummary, computeCorrelationMatrix } = require('../helpers/statsHelper');
const { getDataQuality } = require('../helpers/dataClean');

const router = express.Router();

const generateProfile = async (datasetId) => {
  const data = await pool.query(`SELECT * FROM data_${datasetId} LIMIT 5000`);
  const rows = data.rows.map(r => { const { row_index, ...rest } = r; return rest; });
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  const summary = computeFullSummary(rows);
  const quality = getDataQuality(rows);
  const correlation = computeCorrelationMatrix(rows);

  // Value counts for categorical
  const valueCounts = {};
  for (const col of cols) {
    if (summary[col]?.type === 'categorical') {
      const freq = {};
      rows.forEach(r => { const v = String(r[col] || ''); freq[v] = (freq[v] || 0) + 1; });
      valueCounts[col] = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0, 20).map(([v,c]) => ({ value: v, count: c, pct: +(c/rows.length*100).toFixed(1) }));
    }
  }

  // Sample data
  const sample = rows.slice(0, 5);
  const totalMissing = Object.values(quality.columns || {}).reduce((s, c) => s + c.missing, 0);
  const totalCells = rows.length * cols.length;

  return {
    overview: {
      rowCount: rows.length, columnCount: cols.length,
      numericColumns: cols.filter(c => summary[c]?.type === 'numeric').length,
      categoricalColumns: cols.filter(c => summary[c]?.type === 'categorical').length,
      totalMissing, missingPct: +(totalMissing / totalCells * 100).toFixed(1),
      duplicates: rows.length - new Set(rows.map(r => JSON.stringify(r))).size,
      memorySizeBytes: totalCells * 8,
    },
    columns: summary,
    quality,
    correlation,
    valueCounts,
    sample,
    generatedAt: new Date().toISOString(),
  };
};

// Auto-profile on demand or retrieve cached
router.get('/:datasetId', authenticate, async (req, res) => {
  try {
    const { refresh } = req.query;
    if (!refresh) {
      const cached = await pool.query('SELECT * FROM data_profiles WHERE dataset_id=$1 ORDER BY generated_at DESC LIMIT 1', [req.params.datasetId]);
      if (cached.rows.length) return res.json(cached.rows[0].profile_data);
    }
    const profile = await generateProfile(req.params.datasetId);
    if (!profile) return res.status(404).json({ error: 'Dataset has no data' });
    await pool.query('INSERT INTO data_profiles (dataset_id, profile_data) VALUES ($1,$2)', [req.params.datasetId, JSON.stringify(profile)]);
    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Trigger profiling (async)
router.post('/:datasetId/generate', authenticate, async (req, res) => {
  try {
    const profile = await generateProfile(req.params.datasetId);
    if (!profile) return res.status(400).json({ error: 'No data to profile' });
    await pool.query('DELETE FROM data_profiles WHERE dataset_id=$1', [req.params.datasetId]);
    await pool.query('INSERT INTO data_profiles (dataset_id, profile_data) VALUES ($1,$2)', [req.params.datasetId, JSON.stringify(profile)]);
    res.json({ message: 'Profile generated', overview: profile.overview });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, generateProfile };
