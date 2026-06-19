const express = require('express');
const https = require('https');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Groq AI helper ──────────────────────────────────────────────────────────
const groqChat = (messages, model = 'llama-3.1-8b-instant') => new Promise((resolve, reject) => {
  const body = JSON.stringify({ model, messages, max_tokens: 600, temperature: 0.4 });
  const req = https.request({
    hostname: 'api.groq.com', port: 443, path: '/openai/v1/chat/completions',
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try { resolve(JSON.parse(d)); } catch { reject(new Error('Groq parse error')); }
    });
  });
  req.on('error', reject);
  req.write(body); req.end();
});

// ── SQL column extractor (regex-based) ──────────────────────────────────────
const extractColumnsFromSQL = (sql, schemaColumns = []) => {
  if (!sql) return [];
  const upper = sql.toUpperCase();
  const found = new Set();
  schemaColumns.forEach(col => {
    const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    if (pattern.test(sql)) found.add(col);
  });
  // Also capture quoted identifiers
  const quoted = [...sql.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  quoted.forEach(q => { if (schemaColumns.includes(q)) found.add(q); });
  return [...found];
};

// ── Sensitivity classifier ───────────────────────────────────────────────────
const classifySensitivity = (colName, colType, maskType) => {
  if (maskType) return { level: 'critical', label: 'Masked', color: '#ef4444' };
  const n = colName.toLowerCase();
  if (/email|phone|ssn|passport|credit|card|password|secret|token|key|dob|birth/.test(n))
    return { level: 'high', label: 'PII', color: '#f97316' };
  if (/salary|wage|income|revenue|profit|cost|price|amount|balance/.test(n))
    return { level: 'high', label: 'Financial', color: '#f97316' };
  if (/name|address|location|city|country|zip|postal|gender|race|ethnic/.test(n))
    return { level: 'medium', label: 'Personal', color: '#eab308' };
  if (/id|uuid|created|updated|deleted|status|flag|bool/.test(n))
    return { level: 'low', label: 'Internal', color: '#22c55e' };
  return { level: 'low', label: 'Public', color: '#6b7280' };
};

// ── registerNode / registerEdge helpers ──────────────────────────────────────
const registerNode = async (type, nodeId, name, metadata = {}) => {
  const existing = await pool.query('SELECT id FROM lineage_nodes WHERE node_type=$1 AND node_id=$2', [type, nodeId]);
  if (existing.rows.length) return existing.rows[0].id;
  const r = await pool.query('INSERT INTO lineage_nodes (node_type, node_id, label, metadata) VALUES ($1,$2,$3,$4) RETURNING id', [type, nodeId, name, JSON.stringify(metadata)]);
  return r.rows[0].id;
};
const registerEdge = async (sourceId, targetId, edgeType, metadata = {}) => {
  const existing = await pool.query('SELECT id FROM lineage_edges WHERE source_node=$1 AND target_node=$2', [sourceId, targetId]);
  if (!existing.rows.length) await pool.query('INSERT INTO lineage_edges (source_node, target_node, relationship) VALUES ($1,$2,$3)', [sourceId, targetId, edgeType]);
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/nodes  — all nodes
// ═══════════════════════════════════════════════════════════════════════════
router.get('/nodes', authenticate, async (req, res) => {
  try {
    const nodes = await pool.query('SELECT * FROM lineage_nodes ORDER BY created_at');
    const edges = await pool.query('SELECT * FROM lineage_edges');
    res.json({ nodes: nodes.rows, edges: edges.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/edges
// ═══════════════════════════════════════════════════════════════════════════
router.get('/edges', authenticate, async (req, res) => {
  try {
    const edges = await pool.query(
      `SELECT le.*, sn.label AS source_name, sn.node_type AS source_type,
              tn.label AS target_name, tn.node_type AS target_type
       FROM lineage_edges le
       LEFT JOIN lineage_nodes sn ON le.source_node = sn.node_id
       LEFT JOIN lineage_nodes tn ON le.target_node = tn.node_id
       ORDER BY le.id`
    );
    res.json(edges.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/datasets  — list with edge counts
// ═══════════════════════════════════════════════════════════════════════════
router.get('/datasets', authenticate, async (req, res) => {
  try {
    const datasets = await pool.query('SELECT id, name, row_count, created_at FROM datasets ORDER BY name');
    const nodeCountsRes = await pool.query(
      `SELECT ln.node_id, COUNT(*) as edge_count FROM lineage_edges le
       JOIN lineage_nodes ln ON le.source_node = ln.node_id
       WHERE ln.node_type = 'dataset' GROUP BY ln.node_id`
    );
    const nodeCounts = {};
    nodeCountsRes.rows.forEach(r => { nodeCounts[r.node_id] = parseInt(r.edge_count); });
    res.json(datasets.rows.map(d => ({
      ...d, lineageEdges: nodeCounts[String(d.id)] || 0, hasLineage: (nodeCounts[String(d.id)] || 0) > 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/:datasetId  — full lineage graph
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:datasetId', authenticate, async (req, res) => {
  try {
    const dsId = req.params.datasetId;
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [dsId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const lineage = { dataset: ds.rows[0], nodes: [], edges: [], columns: [], auditTrail: [] };

    // Dataset node
    lineage.nodes.push({ id: `ds_${dsId}`, type: 'dataset', label: ds.rows[0].name, icon: 'database', color: '#6366f1' });

    // Extract schema columns
    const schema = ds.rows[0].schema || [];
    const schemaCols = Array.isArray(schema) ? schema : Object.entries(schema).map(([name, type]) => ({ name, type }));
    const colNames = schemaCols.map(c => c.name);

    // Masking rules for this dataset
    const maskingRules = await pool.query('SELECT * FROM masking_rules WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    const maskMap = {};
    maskingRules.rows.forEach(r => { maskMap[r.column_name] = r; });

    // Versions
    const versions = await pool.query('SELECT * FROM dataset_versions WHERE dataset_id=$1 ORDER BY created_at', [dsId]).catch(() => ({ rows: [] }));
    let prevVersionId = null;
    versions.rows.forEach(v => {
      lineage.nodes.push({ id: `ver_${v.id}`, type: 'version', label: `v${v.id}: ${v.description || 'snapshot'}`, icon: 'git-branch', color: '#8b5cf6', createdAt: v.created_at });
      lineage.edges.push({ source: `ds_${dsId}`, target: `ver_${v.id}`, type: 'versioned_as' });
      if (prevVersionId) lineage.edges.push({ source: `ver_${prevVersionId}`, target: `ver_${v.id}`, type: 'evolved_to' });
      prevVersionId = v.id;
    });

    // Recipes
    const recipes = await pool.query('SELECT * FROM recipes WHERE dataset_id=$1 OR source_dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    const recipeStepMap = {};
    recipes.rows.forEach(r => {
      lineage.nodes.push({ id: `recipe_${r.id}`, type: 'recipe', label: r.name, icon: 'zap', color: '#ec4899' });
      lineage.edges.push({ source: `ds_${dsId}`, target: `recipe_${r.id}`, type: 'transformed_by' });
      // Map which columns each recipe step touches
      if (r.steps) {
        const steps = Array.isArray(r.steps) ? r.steps : [];
        steps.forEach(step => {
          if (step.column) {
            if (!recipeStepMap[step.column]) recipeStepMap[step.column] = [];
            recipeStepMap[step.column].push({ recipe: r.name, action: step.action || step.type || 'transform' });
          }
        });
      }
    });

    // Queries — with column-level extraction
    const queries = await pool.query('SELECT * FROM queries WHERE dataset_id=$1 ORDER BY created_at DESC LIMIT 15', [dsId]).catch(() => ({ rows: [] }));
    const colQueryMap = {}; // col → [queryIds]
    queries.rows.forEach((q, i) => {
      const label = `Query ${i + 1}: ${q.sql_text?.slice(0, 35)}...`;
      lineage.nodes.push({ id: `query_${q.id}`, type: 'query', label, icon: 'code', color: '#10b981', createdAt: q.created_at, sql: q.sql_text, runBy: q.user_id });
      lineage.edges.push({ source: `ds_${dsId}`, target: `query_${q.id}`, type: 'queried_by' });
      // Extract columns referenced in this query
      const refCols = extractColumnsFromSQL(q.sql_text, colNames);
      refCols.forEach(col => {
        if (!colQueryMap[col]) colQueryMap[col] = [];
        colQueryMap[col].push(q.id);
      });
    });

    // Reports
    const reports = await pool.query('SELECT * FROM reports WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    const queryReportEdges = {};
    reports.rows.forEach(r => {
      lineage.nodes.push({ id: `report_${r.id}`, type: 'report', label: r.name, icon: 'file-text', color: '#f59e0b', createdAt: r.created_at });
      // Connect via queries if possible, else connect to dataset directly
      const linkedQueries = queries.rows.filter(q => r.config && JSON.stringify(r.config).includes(String(q.id)));
      if (linkedQueries.length) {
        linkedQueries.forEach(q => lineage.edges.push({ source: `query_${q.id}`, target: `report_${r.id}`, type: 'included_in' }));
      } else if (queries.rows.length > 0) {
        lineage.edges.push({ source: `query_${queries.rows[0].id}`, target: `report_${r.id}`, type: 'included_in' });
      } else {
        lineage.edges.push({ source: `ds_${dsId}`, target: `report_${r.id}`, type: 'included_in' });
      }
    });

    // Audit trail (recent activity on this dataset)
    const audit = await pool.query(
      `SELECT al.action, al.created_at, al.details, u.name as user_name, u.email as user_email
       FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
       WHERE al.resource_type='dataset' AND al.resource_id=$1
       ORDER BY al.created_at DESC LIMIT 10`,
      [dsId]
    ).catch(() => ({ rows: [] }));
    // Also get query runs as audit
    const queryAudit = queries.rows.slice(0, 5).map(q => ({
      action: 'query_run', created_at: q.created_at,
      details: { sql: q.sql_text?.slice(0, 80) }, user_name: 'User #' + (q.user_id || '?'),
    }));
    lineage.auditTrail = [...audit.rows, ...queryAudit].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);

    // Column-level lineage — enriched with governance + query/recipe mappings
    lineage.columns = schemaCols.map(col => {
      const mask = maskMap[col.name];
      const sensitivity = classifySensitivity(col.name, col.type, mask?.mask_type);
      const usedInQueries = colQueryMap[col.name] || [];
      const transforms = recipeStepMap[col.name] || [];
      return {
        name: col.name, type: col.type,
        origin: 'source',
        pii: !!mask || sensitivity.level === 'high',
        maskType: mask?.mask_type || null,
        sensitivity,
        usedInQueries: usedInQueries.length,
        usedInReports: reports.rows.filter(r => usedInQueries.some(qid => r.config && JSON.stringify(r.config).includes(String(qid)))).length,
        transformations: transforms,
        queryIds: usedInQueries,
      };
    });

    res.json(lineage);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/:datasetId/impact  — column change impact analysis
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:datasetId/impact', authenticate, async (req, res) => {
  try {
    const dsId = req.params.datasetId;
    const targetCol = req.query.column || null;

    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [dsId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const schema = ds.rows[0].schema || [];
    const schemaCols = Array.isArray(schema) ? schema.map(c => c.name) : Object.keys(schema);

    const queries = await pool.query('SELECT * FROM queries WHERE dataset_id=$1 ORDER BY created_at DESC', [dsId]).catch(() => ({ rows: [] }));
    const reports = await pool.query('SELECT * FROM reports WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    const recipes = await pool.query('SELECT * FROM recipes WHERE dataset_id=$1 OR source_dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));

    const impactedQueries = [];
    const impactedReports = [];
    const impactedRecipes = [];

    const cols = targetCol ? [targetCol] : schemaCols;

    cols.forEach(col => {
      queries.rows.forEach(q => {
        const refs = extractColumnsFromSQL(q.sql_text, [col]);
        if (refs.length) {
          const existing = impactedQueries.find(iq => iq.id === q.id);
          if (!existing) impactedQueries.push({ id: q.id, sql: q.sql_text?.slice(0, 100), columns: [col], severity: 'critical', createdAt: q.created_at });
          else if (!existing.columns.includes(col)) existing.columns.push(col);
        }
      });
      recipes.rows.forEach(r => {
        if (r.steps && JSON.stringify(r.steps).toLowerCase().includes(col.toLowerCase())) {
          if (!impactedRecipes.find(ir => ir.id === r.id))
            impactedRecipes.push({ id: r.id, name: r.name, columns: [col], severity: 'high' });
        }
      });
    });

    // Reports linked to impacted queries
    const impactedQueryIds = new Set(impactedQueries.map(q => q.id));
    reports.rows.forEach(r => {
      const linked = queries.rows.some(q => impactedQueryIds.has(q.id) && r.config && JSON.stringify(r.config).includes(String(q.id)));
      const directlyLinked = impactedQueryIds.size > 0; // if any queries impacted, reports may be affected
      if (linked || directlyLinked) {
        impactedReports.push({ id: r.id, name: r.name, severity: linked ? 'critical' : 'medium', reason: linked ? 'Directly uses impacted queries' : 'May reference affected data' });
      }
    });

    const riskScore = Math.min(100, impactedQueries.length * 15 + impactedReports.length * 20 + impactedRecipes.length * 10);

    res.json({
      datasetId: dsId, datasetName: ds.rows[0].name, targetColumn: targetCol,
      impactedQueries, impactedReports, impactedRecipes,
      summary: {
        totalImpacted: impactedQueries.length + impactedReports.length + impactedRecipes.length,
        criticalCount: impactedQueries.length + impactedReports.filter(r => r.severity === 'critical').length,
        riskScore,
        riskLevel: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/:datasetId/governance  — column governance metadata
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:datasetId/governance', authenticate, async (req, res) => {
  try {
    const dsId = req.params.datasetId;
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [dsId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const schema = ds.rows[0].schema || [];
    const schemaCols = Array.isArray(schema) ? schema : Object.entries(schema).map(([name, type]) => ({ name, type }));

    const maskingRules = await pool.query('SELECT * FROM masking_rules WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    const maskMap = {};
    maskingRules.rows.forEach(r => { maskMap[r.column_name] = r; });

    const queries = await pool.query('SELECT sql_text FROM queries WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    const colNames = schemaCols.map(c => c.name);

    const columns = schemaCols.map(col => {
      const mask = maskMap[col.name];
      const sensitivity = classifySensitivity(col.name, col.type, mask?.mask_type);
      const queryRefs = queries.rows.filter(q => extractColumnsFromSQL(q.sql_text, [col.name]).length > 0).length;
      return {
        name: col.name, type: col.type,
        pii: sensitivity.level === 'high' || sensitivity.level === 'critical' || !!mask,
        maskType: mask?.mask_type || null,
        maskConfig: mask?.mask_config || null,
        sensitivity,
        queryReferenceCount: queryRefs,
        complianceFlags: [
          ...(sensitivity.level === 'high' || !!mask ? ['GDPR'] : []),
          ...(sensitivity.level === 'high' && /email|phone|ssn/.test(col.name.toLowerCase()) ? ['CCPA', 'HIPAA'] : []),
          ...(mask?.mask_type ? ['Masked'] : []),
        ],
      };
    });

    const piiCount = columns.filter(c => c.pii).length;
    const maskedCount = columns.filter(c => c.maskType).length;
    const complianceScore = Math.round(100 - (piiCount - maskedCount) / Math.max(columns.length, 1) * 100);

    res.json({
      datasetId: dsId, datasetName: ds.rows[0].name,
      columns, summary: { total: columns.length, piiCount, maskedCount, complianceScore, unmaskedPii: piiCount - maskedCount }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /lineage/:datasetId/narrative  — AI-generated lineage narrative
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:datasetId/narrative', authenticate, async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'GROQ_API_KEY not configured' });

    const dsId = req.params.datasetId;
    const { lineageSummary } = req.body; // client sends a compact lineage summary

    const ds = await pool.query('SELECT name, row_count, created_at FROM datasets WHERE id=$1', [dsId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });

    const queries = await pool.query('SELECT COUNT(*) as n FROM queries WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [{ n: 0 }] }));
    const reports = await pool.query('SELECT COUNT(*) as n FROM reports WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [{ n: 0 }] }));
    const versions = await pool.query('SELECT COUNT(*) as n FROM dataset_versions WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [{ n: 0 }] }));
    const recipes = await pool.query('SELECT COUNT(*) as n FROM recipes WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [{ n: 0 }] }));
    const maskingCount = await pool.query('SELECT COUNT(*) as n FROM masking_rules WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [{ n: 0 }] }));

    const context = `
Dataset: "${ds.rows[0].name}"
Row count: ${ds.rows[0].row_count || 'unknown'}
Created: ${ds.rows[0].created_at}
Queries run: ${queries.rows[0].n}
Reports generated: ${reports.rows[0].n}
Dataset versions: ${versions.rows[0].n}
Data transformation recipes: ${recipes.rows[0].n}
Columns with masking rules: ${maskingCount.rows[0].n}
${lineageSummary ? `Additional context: ${lineageSummary}` : ''}
`.trim();

    const result = await groqChat([
      { role: 'system', content: 'You are an enterprise data governance AI. Generate a clear, professional lineage narrative (3-5 sentences) describing how the data flows, what transformations occur, and what governance controls are in place. Be specific, factual, and concise. Do not use markdown.' },
      { role: 'user', content: `Generate a data lineage narrative for:\n${context}` }
    ]);

    const narrative = result.choices?.[0]?.message?.content || 'Unable to generate narrative at this time.';
    res.json({ narrative });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/:datasetId/annotations  — lineage node annotations
// POST /lineage/:datasetId/annotations — add annotation
// DELETE /lineage/annotations/:id
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:datasetId/annotations', authenticate, async (req, res) => {
  try {
    const { nodeId } = req.query;
    const base = `SELECT la.*, u.name as user_name, u.email as user_email
      FROM lineage_annotations la LEFT JOIN users u ON la.user_id=u.id
      WHERE la.dataset_id=$1`;
    const r = nodeId
      ? await pool.query(base + ' AND la.node_id=$2 ORDER BY la.created_at DESC', [req.params.datasetId, nodeId])
      : await pool.query(base + ' ORDER BY la.created_at DESC', [req.params.datasetId]);
    res.json(r.rows);
  } catch (err) {
    // Table may not exist yet — return empty array gracefully
    res.json([]);
  }
});

router.post('/:datasetId/annotations', authenticate, async (req, res) => {
  try {
    const { nodeId, nodeLabel, content, annotationType = 'comment' } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    // Ensure table exists
    await pool.query(`CREATE TABLE IF NOT EXISTS lineage_annotations (
      id SERIAL PRIMARY KEY, dataset_id INTEGER, node_id TEXT, node_label TEXT,
      annotation_type TEXT DEFAULT 'comment', content TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id), status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const r = await pool.query(
      'INSERT INTO lineage_annotations (dataset_id, node_id, node_label, annotation_type, content, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.datasetId, nodeId, nodeLabel, annotationType, content.trim(), req.user.id]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/annotations/:id', authenticate, async (req, res) => {
  try {
    const { content, status } = req.body;
    const fields = [], vals = [], idx = [req.params.id];
    if (content) { fields.push(`content=$${idx.length + 1}`); vals.push(content); idx.push(content); }
    if (status) { fields.push(`status=$${idx.length + 1}`); vals.push(status); idx.push(status); }
    fields.push('updated_at=NOW()');
    await pool.query(`UPDATE lineage_annotations SET ${fields.join(',')} WHERE id=$1`, [req.params.id, ...vals]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/annotations/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM lineage_annotations WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /lineage/track  — record a lineage edge
// ═══════════════════════════════════════════════════════════════════════════
router.post('/track', authenticate, async (req, res) => {
  try {
    const { sourceType, sourceId, sourceName, targetType, targetId, targetName, edgeType = 'derived_from', metadata = {} } = req.body;
    const srcNodeId = await registerNode(sourceType, sourceId, sourceName, metadata);
    const tgtNodeId = await registerNode(targetType, targetId, targetName, metadata);
    await registerEdge(srcNodeId, tgtNodeId, edgeType, metadata);
    res.json({ message: 'Lineage edge recorded', sourceNodeId: srcNodeId, targetNodeId: tgtNodeId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/graph/all
// ═══════════════════════════════════════════════════════════════════════════
router.get('/graph/all', authenticate, async (req, res) => {
  try {
    const nodes = await pool.query('SELECT * FROM lineage_nodes ORDER BY created_at');
    const edges = await pool.query('SELECT * FROM lineage_edges');
    res.json({ nodes: nodes.rows, edges: edges.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /lineage/  — dataset list
// ═══════════════════════════════════════════════════════════════════════════
router.get('/', authenticate, async (req, res) => {
  try {
    const datasets = await pool.query('SELECT id, name, row_count, created_at FROM datasets ORDER BY name');
    res.json(datasets.rows.map(d => ({ ...d, lineageEdges: 0, hasLineage: false })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
