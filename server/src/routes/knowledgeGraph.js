const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Entity classification
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

const ENTITY_COLORS = {
  customer: '#6366f1', product: '#10b981', region: '#3b82f6',
  time: '#f59e0b', financial: '#ef4444', employee: '#8b5cf6',
  order: '#ec4899', performance: '#14b8a6', identity: '#6b7280',
  category: '#f97316', attribute: '#9ca3af',
};

// ── PII / Sensitivity detection
const PII_PATTERNS = {
  email: /\bemail\b|e_mail|mail_addr/i,
  phone: /\bphone\b|mobile|cell|tel\b|telephone/i,
  ssn: /\bssn\b|social_security|national_id|sin\b/i,
  credit_card: /credit_card|card_number|cc_num|pan\b/i,
  ip_address: /\bip\b|ip_addr|ip_address/i,
  date_of_birth: /\bdob\b|birth_date|date_of_birth|birthdate/i,
  address: /\baddress\b|street|postal|zip_code|postcode/i,
  name: /\bfirst_name\b|\blast_name\b|\bfull_name\b|\bname\b/i,
  passport: /passport|national_passport/i,
  salary: /\bsalary\b|\bwage\b|\bcompensation\b/i,
};

const detectPII = (colName) => {
  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    if (pattern.test(colName)) return piiType;
  }
  return null;
};

const PII_SENSITIVITY = {
  ssn: 'critical', credit_card: 'critical', passport: 'critical',
  email: 'high', phone: 'high', date_of_birth: 'high', salary: 'high',
  name: 'medium', address: 'medium', ip_address: 'medium',
};

const detectEntityType = (colName) => {
  const name = colName.toLowerCase().replace(/_/g, ' ');
  for (const [entity, pattern] of Object.entries(ENTITY_PATTERNS)) {
    if (pattern.test(name)) return entity;
  }
  return 'attribute';
};

// ── Generate AI narratives from graph data
const generateNarratives = (datasets, sharedCols, schemaConflicts, piiCols) => {
  const narratives = [];

  // Joinable datasets narrative
  if (sharedCols.length > 0) {
    const topJoin = sharedCols.sort((a, b) => b.datasets - a.datasets)[0];
    narratives.push(`"${topJoin.name}" appears in ${topJoin.datasets} datasets — it's your primary join key enabling cross-dataset analysis.`);
  }

  // Revenue narrative
  const revJoin = sharedCols.find(c => /revenue|sales|profit/i.test(c.name));
  if (revJoin) {
    narratives.push(`"${revJoin.name}" is joinable across ${revJoin.datasets} datasets, enabling unified profitability analysis across your data warehouse.`);
  }

  // Customer identity narrative
  const custJoin = sharedCols.find(c => /customer|user|client/i.test(c.name));
  if (custJoin) {
    narratives.push(`Customer identity key "${custJoin.name}" links ${custJoin.datasets} datasets — recommended for churn prediction and 360° customer profiles.`);
  }

  // PII narrative
  if (piiCols.length > 0) {
    const criticalPII = piiCols.filter(c => ['critical', 'high'].includes(PII_SENSITIVITY[c.piiType]));
    if (criticalPII.length > 0) {
      narratives.push(`⚠️ ${criticalPII.length} PII column(s) detected (${criticalPII.slice(0, 3).map(c => c.name).join(', ')}). Ensure masking rules and GDPR/CCPA controls are applied.`);
    }
  }

  // Schema conflict narrative
  if (schemaConflicts.length > 0) {
    narratives.push(`🚨 ${schemaConflicts.length} schema conflict(s) detected where the same column name has different data types across datasets — verify before joining.`);
  }

  // Recommended joins narrative
  if (sharedCols.length >= 2) {
    narratives.push(`${sharedCols.length} shared keys detected. Recommended analysis: JOIN ${datasets.slice(0, 3).map(d => d.name).join(', ')} on common keys to build a unified data model.`);
  }

  if (!narratives.length) {
    narratives.push('No strong cross-dataset relationships detected yet. Import more datasets or enrich schemas to unlock semantic analysis.');
  }
  return narratives;
};

// ── Detect schema conflicts (same column name, different types across datasets)
const detectSchemaConflicts = (datasets) => {
  const colTypeMap = {}; // colName → [{dsName, type}]
  for (const ds of datasets) {
    const schema = Array.isArray(ds.schema) ? ds.schema : Object.entries(ds.schema || {}).map(([name, type]) => ({ name, type }));
    for (const col of schema) {
      const key = col.name.toLowerCase();
      if (!colTypeMap[key]) colTypeMap[key] = [];
      colTypeMap[key].push({ dataset: ds.name, type: String(col.type).toLowerCase() });
    }
  }
  const conflicts = [];
  for (const [colName, appearances] of Object.entries(colTypeMap)) {
    if (appearances.length < 2) continue;
    const types = [...new Set(appearances.map(a => a.type))];
    if (types.length > 1) {
      conflicts.push({ column: colName, appearances, types });
    }
  }
  return conflicts;
};

// ── Generate join recommendations
const generateJoinRecommendations = (datasets, sharedCols) => {
  const recs = [];
  for (const sc of sharedCols.slice(0, 6)) {
    const dsList = datasets.filter(ds => {
      const schema = Array.isArray(ds.schema) ? ds.schema : Object.entries(ds.schema || {}).map(([name, type]) => ({ name, type }));
      return schema.some(c => c.name.toLowerCase() === sc.name.toLowerCase());
    });
    if (dsList.length >= 2) {
      const [d1, d2] = dsList;
      const useCase = /customer|user|client/i.test(sc.name) ? 'Customer 360 / Churn Analysis'
        : /revenue|sales|profit/i.test(sc.name) ? 'Unified Profitability Analysis'
        : /product|item|sku/i.test(sc.name) ? 'Product Performance Analysis'
        : /date|time|month/i.test(sc.name) ? 'Time-Series Cross-Dataset Analysis'
        : /region|country|location/i.test(sc.name) ? 'Geographic Rollup Analysis'
        : 'Cross-Dataset Join';
      recs.push({
        key: sc.name,
        datasets: dsList.map(d => d.name),
        useCase,
        sql: `SELECT a.*, b.*\nFROM data_${d1.id} a\nJOIN data_${d2.id} b ON a."${sc.name}" = b."${sc.name}"`,
      });
    }
  }
  return recs;
};

const buildGraph = async (req, res) => {
  try {
    const dsResult = await pool.query('SELECT id, name, schema, row_count FROM datasets ORDER BY created_at DESC LIMIT 20');
    const datasets = dsResult.rows;

    const nodes = [];
    const edges = [];
    const columnIndex = {};
    const piiCols = [];

    for (const ds of datasets) {
      const schema = Array.isArray(ds.schema) ? ds.schema
        : Object.entries(ds.schema || {}).map(([name, type]) => ({ name, type }));

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
        const piiType = detectPII(col.name);
        const sensitivity = piiType ? (PII_SENSITIVITY[piiType] || 'low') : null;
        const nodeId = `ent_${entityType}_${col.name}`;

        if (piiType) {
          piiCols.push({ name: col.name, piiType, sensitivity, dataset: ds.name });
        }

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
            piiType: piiType || null,
            sensitivity: sensitivity || null,
          });
        } else {
          const existing = nodes.find(n => n.id === nodeId);
          if (existing && !existing.datasets?.includes(ds.id)) {
            existing.datasets = [...(existing.datasets || []), ds.id];
            existing.size = Math.min(50, existing.size + 5);
          }
        }

        edges.push({
          id: `${ds.id}_${col.name}`,
          source: `ds_${ds.id}`,
          target: nodeId,
          label: col.type,
          type: 'contains',
          weight: 1,
        });

        const key = col.name.toLowerCase();
        if (!columnIndex[key]) columnIndex[key] = [];
        columnIndex[key].push(ds.id);
      }
    }

    // Joinable edges
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

    const sharedColsSummary = sharedCols.map(([name, dsList]) => ({ name, datasets: dsList.length }));
    const schemaConflicts = detectSchemaConflicts(datasets);
    const joinRecommendations = generateJoinRecommendations(datasets, sharedColsSummary);
    const narratives = generateNarratives(datasets, sharedColsSummary, schemaConflicts, piiCols);

    const entityTypeSummary = {};
    nodes.filter(n => n.type === 'entity').forEach(n => {
      entityTypeSummary[n.entityType] = (entityTypeSummary[n.entityType] || 0) + 1;
    });

    res.json({
      nodes,
      edges,
      narratives,
      schemaConflicts,
      joinRecommendations,
      piiSummary: {
        total: piiCols.length,
        critical: piiCols.filter(c => c.sensitivity === 'critical').length,
        high: piiCols.filter(c => c.sensitivity === 'high').length,
        columns: [...new Map(piiCols.map(c => [c.name, c])).values()].slice(0, 20),
      },
      stats: {
        totalDatasets: datasets.length,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        joinableDatasets: sharedCols.length,
        entityTypes: entityTypeSummary,
        sharedColumns: sharedColsSummary.sort((a, b) => b.datasets - a.datasets).slice(0, 12),
        schemaConflicts: schemaConflicts.length,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

router.get('/', authenticate, buildGraph);
router.get('/analyze', authenticate, buildGraph);
router.get('/nodes', authenticate, buildGraph);

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
      joinSuggestion: shared.length > 0
        ? `SELECT a.*, b.*\nFROM data_${req.params.id1} a\nJOIN data_${req.params.id2} b ON a."${shared[0]}" = b."${shared[0]}"`
        : null,
      relationship: shared.length > 0 ? 'joinable' : 'unrelated',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Entity detail
router.get('/entity/:colName', authenticate, async (req, res) => {
  try {
    const col = req.params.colName.toLowerCase();
    const datasets = await pool.query('SELECT id, name, schema, row_count FROM datasets');
    const found = [];
    for (const ds of datasets.rows) {
      const schema = Array.isArray(ds.schema) ? ds.schema : [];
      const match = schema.find(c => c.name.toLowerCase() === col);
      if (match) found.push({ dataset: ds.name, datasetId: ds.id, type: match.type, rowCount: ds.row_count });
    }
    const piiType = detectPII(req.params.colName);
    res.json({
      column: req.params.colName,
      entityType: detectEntityType(req.params.colName),
      appearsIn: found,
      color: ENTITY_COLORS[detectEntityType(req.params.colName)],
      piiType: piiType || null,
      sensitivity: piiType ? (PII_SENSITIVITY[piiType] || 'low') : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save annotation for a node
router.post('/annotations', authenticate, async (req, res) => {
  try {
    const { nodeId, text, nodeLabel } = req.body;
    if (!nodeId || !text) return res.status(400).json({ error: 'nodeId and text required' });
    const r = await pool.query(
      `INSERT INTO annotations (dataset_id, column_name, comment, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [null, nodeLabel || nodeId, text, req.user.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/annotations/:nodeLabel', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.*, u.name AS author FROM annotations a
       LEFT JOIN users u ON u.id = a.created_by
       WHERE a.column_name = $1 ORDER BY a.created_at DESC LIMIT 20`,
      [req.params.nodeLabel]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
