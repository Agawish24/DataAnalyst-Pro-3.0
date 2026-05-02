const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const ENTITY_PATTERNS = {
  customer: /customer|client|user|buyer|account|contact|person/i,
  product: /product|item|sku|good|service|catalog|merchandise/i,
  region: /region|country|city|state|location|territory|area|zone|market/i,
  time: /date|time|month|year|quarter|period|day|week|timestamp/i,
  financial: /revenue|sales|profit|cost|price|amount|value|budget|spend|income|margin|discount|bonus|salary/i,
  employee: /employee|staff|worker|manager|rep|agent|hr|hire|department/i,
  order: /order|transaction|purchase|invoice|deal|contract|shipment/i,
  performance: /score|rating|rank|performance|kpi|metric|rate|ratio|percent/i,
  identity: /id|key|code|number|ref|identifier/i,
  category: /category|type|class|group|segment|tier|level|status/i,
};

const detectEntityType = (colName) => {
  const name = colName.toLowerCase().replace(/_/g, ' ');
  for (const [entity, pattern] of Object.entries(ENTITY_PATTERNS)) {
    if (pattern.test(name)) return entity;
  }
  return 'attribute';
};

const ENTITY_COLORS = {
  customer: '#6366f1', product: '#10b981', region: '#3b82f6',
  time: '#f59e0b', financial: '#ef4444', employee: '#8b5cf6',
  order: '#ec4899', performance: '#14b8a6', identity: '#6b7280',
  category: '#f97316', attribute: '#9ca3af',
};

router.get('/analyze', authenticate, async (req, res) => {
  try {
    const datasets = await pool.query(
      'SELECT id, name, schema, row_count FROM datasets WHERE uploaded_by=$1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );

    const nodes = [];
    const edges = [];
    const columnIndex = {}; // colName → [datasetIds]

    // Build dataset nodes and column index
    for (const ds of datasets.rows) {
      const schema = Array.isArray(ds.schema) ? ds.schema : (ds.schema ? Object.entries(ds.schema).map(([name, type]) => ({ name, type })) : []);

      nodes.push({
        id: `ds_${ds.id}`,
        label: ds.name,
        type: 'dataset',
        rowCount: ds.row_count,
        columnCount: schema.length,
        color: '#1e40af',
        size: Math.min(80, 30 + Math.log(Math.max(ds.row_count || 1, 1)) * 8),
      });

      for (const col of schema) {
        const entityType = detectEntityType(col.name);
        const nodeId = `ent_${entityType}_${col.name}`;

        if (!nodes.find(n => n.id === nodeId)) {
          nodes.push({
            id: nodeId,
            label: col.name,
            type: 'entity',
            entityType,
            dataType: col.type,
            color: ENTITY_COLORS[entityType] || '#9ca3af',
            size: 20,
            datasets: [ds.id],
          });
        } else {
          const existing = nodes.find(n => n.id === nodeId);
          if (existing && !existing.datasets?.includes(ds.id)) {
            existing.datasets = [...(existing.datasets || []), ds.id];
            existing.size = Math.min(50, existing.size + 5);
          }
        }

        // Dataset → entity edge
        edges.push({
          id: `${ds.id}_${col.name}`,
          source: `ds_${ds.id}`,
          target: nodeId,
          label: col.type,
          type: 'contains',
          weight: 1,
        });

        if (!columnIndex[col.name.toLowerCase()]) columnIndex[col.name.toLowerCase()] = [];
        columnIndex[col.name.toLowerCase()].push(ds.id);
      }
    }

    // Find dataset-to-dataset relationships via shared columns
    const sharedCols = Object.entries(columnIndex).filter(([, dsList]) => dsList.length > 1);
    for (const [colName, dsList] of sharedCols) {
      for (let i = 0; i < dsList.length; i++) {
        for (let j = i + 1; j < dsList.length; j++) {
          edges.push({
            id: `join_${dsList[i]}_${dsList[j]}_${colName}`,
            source: `ds_${dsList[i]}`,
            target: `ds_${dsList[j]}`,
            label: `shared: ${colName}`,
            type: 'joinable',
            weight: 3,
          });
        }
      }
    }

    // Cluster summary
    const entityTypeSummary = {};
    nodes.filter(n => n.type === 'entity').forEach(n => {
      entityTypeSummary[n.entityType] = (entityTypeSummary[n.entityType] || 0) + 1;
    });

    res.json({
      nodes,
      edges,
      stats: {
        totalDatasets: datasets.rows.length,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        joinableDatasets: sharedCols.length,
        entityTypes: entityTypeSummary,
        sharedColumns: sharedCols.map(([name, dsList]) => ({ name, datasets: dsList.length })).slice(0, 10),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Detailed relationship between two datasets
router.get('/relationships/:id1/:id2', authenticate, async (req, res) => {
  try {
    const [ds1, ds2] = await Promise.all([
      pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.id1]),
      pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.id2]),
    ]);
    if (!ds1.rows.length || !ds2.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const schema1 = Array.isArray(ds1.rows[0].schema) ? ds1.rows[0].schema : [];
    const schema2 = Array.isArray(ds2.rows[0].schema) ? ds2.rows[0].schema : [];

    const cols1 = new Set(schema1.map(c => c.name.toLowerCase()));
    const cols2 = new Set(schema2.map(c => c.name.toLowerCase()));
    const shared = [...cols1].filter(c => cols2.has(c));

    res.json({
      dataset1: { id: ds1.rows[0].id, name: ds1.rows[0].name, columns: schema1.length },
      dataset2: { id: ds2.rows[0].id, name: ds2.rows[0].name, columns: schema2.length },
      sharedColumns: shared,
      joinSuggestion: shared.length > 0 ? `SELECT * FROM data_${req.params.id1} a JOIN data_${req.params.id2} b ON a."${shared[0]}" = b."${shared[0]}"` : null,
      relationship: shared.length > 0 ? 'joinable' : 'unrelated',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Entity detail: which datasets contain this column
router.get('/entity/:colName', authenticate, async (req, res) => {
  try {
    const col = req.params.colName.toLowerCase();
    const datasets = await pool.query('SELECT id, name, schema, row_count FROM datasets WHERE uploaded_by=$1', [req.user.id]);

    const found = [];
    for (const ds of datasets.rows) {
      const schema = Array.isArray(ds.schema) ? ds.schema : [];
      const match = schema.find(c => c.name.toLowerCase() === col);
      if (match) found.push({ dataset: ds.name, datasetId: ds.id, type: match.type, rowCount: ds.row_count });
    }

    res.json({
      column: req.params.colName,
      entityType: detectEntityType(req.params.colName),
      appearsIn: found,
      color: ENTITY_COLORS[detectEntityType(req.params.colName)],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
