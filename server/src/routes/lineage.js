const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const registerNode = async (type, nodeId, name, metadata = {}) => {
  const existing = await pool.query('SELECT id FROM lineage_nodes WHERE node_type=$1 AND node_id=$2', [type, nodeId]);
  if (existing.rows.length) return existing.rows[0].id;
  const r = await pool.query('INSERT INTO lineage_nodes (node_type, node_id, node_name, metadata) VALUES ($1,$2,$3,$4) RETURNING id', [type, nodeId, name, JSON.stringify(metadata)]);
  return r.rows[0].id;
};

const registerEdge = async (sourceId, targetId, edgeType, metadata = {}) => {
  const existing = await pool.query('SELECT id FROM lineage_edges WHERE source_id=$1 AND target_id=$2', [sourceId, targetId]);
  if (!existing.rows.length) await pool.query('INSERT INTO lineage_edges (source_id, target_id, edge_type, metadata) VALUES ($1,$2,$3,$4)', [sourceId, targetId, edgeType, JSON.stringify(metadata)]);
};

// /nodes and /edges must be BEFORE /:datasetId to avoid wildcard swallowing them
router.get('/nodes', authenticate, async (req, res) => {
  try {
    const nodes = await pool.query('SELECT * FROM lineage_nodes ORDER BY created_at');
    const edges = await pool.query('SELECT * FROM lineage_edges');
    res.json({ nodes: nodes.rows, edges: edges.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/edges', authenticate, async (req, res) => {
  try {
    const edges = await pool.query(
      `SELECT le.*, sn.node_name AS source_name, sn.node_type AS source_type,
              tn.node_name AS target_name, tn.node_type AS target_type
       FROM lineage_edges le
       JOIN lineage_nodes sn ON le.source_id = sn.id
       JOIN lineage_nodes tn ON le.target_id = tn.id
       ORDER BY le.id`
    );
    res.json(edges.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const datasets = await pool.query('SELECT id, name, row_count, created_at FROM datasets ORDER BY name');
    res.json(datasets.rows.map(d => ({ ...d, lineageEdges: 0, hasLineage: false })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/datasets', authenticate, async (req, res) => {
  try {
    const datasets = await pool.query('SELECT id, name, row_count, created_at FROM datasets ORDER BY name');
    const nodeCountsRes = await pool.query(
      `SELECT node_id, COUNT(*) as edge_count FROM lineage_edges le
       JOIN lineage_nodes ln ON le.source_id = ln.id
       WHERE ln.node_type = 'dataset' GROUP BY node_id`
    );
    const nodeCounts = {};
    nodeCountsRes.rows.forEach(r => { nodeCounts[r.node_id] = parseInt(r.edge_count); });
    res.json(datasets.rows.map(d => ({
      ...d,
      lineageEdges: nodeCounts[String(d.id)] || 0,
      hasLineage: (nodeCounts[String(d.id)] || 0) > 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:datasetId', authenticate, async (req, res) => {
  try {
    const dsId = req.params.datasetId;
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [dsId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const nodes = await pool.query("SELECT * FROM lineage_nodes WHERE node_type='dataset' AND node_id=$1 OR node_id IN (SELECT DISTINCT source_id FROM lineage_edges le JOIN lineage_nodes ln ON le.target_id=ln.id WHERE ln.node_type='dataset' AND ln.node_id=$1) OR node_id IN (SELECT DISTINCT target_id FROM lineage_edges le JOIN lineage_nodes ln ON le.source_id=ln.id WHERE ln.node_type='dataset' AND ln.node_id=$1)", [dsId]);
    const mainNode = nodes.rows.find(n => n.node_type === 'dataset' && n.node_id == dsId);

    // Auto-generate lineage from system activity if no explicit nodes
    const lineage = {
      dataset: ds.rows[0],
      nodes: [],
      edges: [],
      columns: [],
    };

    // Add dataset node
    lineage.nodes.push({ id: `ds_${dsId}`, type: 'dataset', label: ds.rows[0].name, icon: 'database', color: '#6366f1' });

    // Add query nodes from history
    const queries = await pool.query('SELECT * FROM queries WHERE dataset_id=$1 ORDER BY created_at DESC LIMIT 10', [dsId]).catch(() => ({ rows: [] }));
    queries.rows.forEach((q, i) => {
      lineage.nodes.push({ id: `query_${q.id}`, type: 'query', label: `Query ${i+1}: ${q.sql_text?.slice(0, 40)}...`, icon: 'code', color: '#10b981', createdAt: q.created_at });
      lineage.edges.push({ source: `ds_${dsId}`, target: `query_${q.id}`, type: 'queried_by' });
    });

    // Add report nodes
    const reports = await pool.query('SELECT * FROM reports WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    reports.rows.forEach(r => {
      lineage.nodes.push({ id: `report_${r.id}`, type: 'report', label: r.name, icon: 'file-text', color: '#f59e0b' });
      lineage.edges.push({ source: `ds_${dsId}`, target: `report_${r.id}`, type: 'included_in' });
    });

    // Add version nodes
    const versions = await pool.query('SELECT * FROM dataset_versions WHERE dataset_id=$1 ORDER BY created_at', [dsId]).catch(() => ({ rows: [] }));
    let prevVersionId = null;
    versions.rows.forEach(v => {
      lineage.nodes.push({ id: `ver_${v.id}`, type: 'version', label: `v${v.id}: ${v.description || 'snapshot'}`, icon: 'git-branch', color: '#8b5cf6', createdAt: v.created_at });
      lineage.edges.push({ source: `ds_${dsId}`, target: `ver_${v.id}`, type: 'versioned_as' });
      if (prevVersionId) lineage.edges.push({ source: `ver_${prevVersionId}`, target: `ver_${v.id}`, type: 'evolved_to' });
      prevVersionId = v.id;
    });

    // Add recipe nodes
    const recipes = await pool.query("SELECT * FROM recipes WHERE dataset_id=$1 OR source_dataset_id=$1", [dsId]).catch(() => ({ rows: [] }));
    recipes.rows.forEach(r => {
      lineage.nodes.push({ id: `recipe_${r.id}`, type: 'recipe', label: r.name, icon: 'zap', color: '#ec4899' });
      lineage.edges.push({ source: `ds_${dsId}`, target: `recipe_${r.id}`, type: 'transformed_by' });
    });

    // Column-level lineage from dataset schema (array format)
    const schema = ds.rows[0].schema || [];
    const schemaCols = Array.isArray(schema)
      ? schema
      : Object.entries(schema).map(([name, type]) => ({ name, type }));
    lineage.columns = schemaCols.map(col => ({
      name: col.name, type: col.type, origin: 'source',
      transformations: recipes.rows.map(r => r.name),
    }));

    res.json(lineage);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/track', authenticate, async (req, res) => {
  try {
    const { sourceType, sourceId, sourceName, targetType, targetId, targetName, edgeType = 'derived_from', metadata = {} } = req.body;
    const srcNodeId = await registerNode(sourceType, sourceId, sourceName, metadata);
    const tgtNodeId = await registerNode(targetType, targetId, targetName, metadata);
    await registerEdge(srcNodeId, tgtNodeId, edgeType, metadata);
    res.json({ message: 'Lineage edge recorded', sourceNodeId: srcNodeId, targetNodeId: tgtNodeId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/graph/all', authenticate, async (req, res) => {
  try {
    const nodes = await pool.query('SELECT * FROM lineage_nodes ORDER BY created_at');
    const edges = await pool.query('SELECT * FROM lineage_edges');
    res.json({ nodes: nodes.rows, edges: edges.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
