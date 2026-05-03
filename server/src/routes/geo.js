const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const listLayers = async (req, res) => {
  try {
    // Show all layers (shared resource) — deletion is still ownership-gated
    const r = await pool.query('SELECT gl.*, d.name as dataset_name FROM geo_layers gl LEFT JOIN datasets d ON gl.dataset_id=d.id ORDER BY gl.created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

router.get('/', authenticate, listLayers);
router.get('/layers', authenticate, listLayers);

// GET /layers/:id — single layer (frontend calls /api/geo/layers/:id)
router.get('/layers/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT gl.*, d.name as dataset_name FROM geo_layers gl LEFT JOIN datasets d ON gl.dataset_id=d.id WHERE gl.id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Layer not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// On-demand GeoJSON generation from body params (no saved layer needed)
router.post('/geojson', authenticate, async (req, res) => {
  try {
    const { dataset_id, lat_col, lng_col, value_col } = req.body;
    if (!dataset_id) return res.status(400).json({ error: 'dataset_id required' });
    const latC = lat_col || 'lat'; const lngC = lng_col || 'lng';
    const cols = [latC, lngC, value_col].filter(Boolean).map(c => `"${c}"`).join(', ');
    const data = await pool.query(`SELECT ${cols} FROM data_${dataset_id} LIMIT 5000`).catch(() => ({ rows: [] }));
    const features = data.rows
      .map(row => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(row[lngC]), parseFloat(row[latC])] },
        properties: value_col ? { value: parseFloat(row[value_col]) || 0 } : {},
      }))
      .filter(f => !isNaN(f.geometry.coordinates[0]) && !isNaN(f.geometry.coordinates[1]));
    res.json({ type: 'FeatureCollection', features, pointCount: features.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, dataset_id, lat_col, lng_col, value_col, layer_type = 'points', style_config = {} } = req.body;
    if (!name || !dataset_id || !lat_col || !lng_col) return res.status(400).json({ error: 'name, dataset_id, lat_col, lng_col required' });
    const r = await pool.query('INSERT INTO geo_layers (name, dataset_id, lat_col, lng_col, value_col, layer_type, style_config, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [name, dataset_id, lat_col, lng_col, value_col || null, layer_type, JSON.stringify(style_config), req.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET a single layer by id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT gl.*, d.name as dataset_name FROM geo_layers gl LEFT JOIN datasets d ON gl.dataset_id=d.id WHERE gl.id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Layer not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/data', authenticate, async (req, res) => {
  try {
    const layer = await pool.query('SELECT * FROM geo_layers WHERE id=$1', [req.params.id]);
    if (!layer.rows.length) return res.status(404).json({ error: 'Layer not found' });
    const l = layer.rows[0];
    const cols = [l.lat_col, l.lng_col, l.value_col].filter(Boolean).map(c => `"${c}"`).join(', ');
    const data = await pool.query(`SELECT ${cols} FROM data_${l.dataset_id} WHERE "${l.lat_col}" IS NOT NULL AND "${l.lng_col}" IS NOT NULL LIMIT 10000`);
    const geojson = {
      type: 'FeatureCollection',
      features: data.rows.map(row => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(row[l.lng_col]), parseFloat(row[l.lat_col])] },
        properties: l.value_col ? { value: parseFloat(row[l.value_col]) || 0 } : {},
      })).filter(f => !isNaN(f.geometry.coordinates[0]) && !isNaN(f.geometry.coordinates[1])),
    };
    res.json({ layer: l, geojson, pointCount: geojson.features.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM geo_layers WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Layer deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
