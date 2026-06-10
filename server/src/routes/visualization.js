const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────────────────
const SAFE_AGG = { count: 'COUNT', sum: 'SUM', avg: 'AVG', max: 'MAX', min: 'MIN', median: 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY' };
const SAFE_OPS = { '=': '=', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=', contains: 'ILIKE', not_contains: 'NOT ILIKE', is_null: 'IS NULL', is_not_null: 'IS NOT NULL' };

const validateColumn = (col, schema) => {
  const cols = Array.isArray(schema) ? schema.map(c => c.name) : Object.keys(schema || {});
  return cols.includes(col);
};

const buildWhereClause = (filters, schema, paramOffset = 1) => {
  if (!filters || !filters.length) return { clause: '', params: [], nextIdx: paramOffset };
  const parts = [];
  const params = [];
  let idx = paramOffset;
  for (const f of filters) {
    if (!validateColumn(f.column, schema)) continue;
    const op = SAFE_OPS[f.operator];
    if (!op) continue;
    const col = `"${f.column}"`;
    if (f.operator === 'is_null') { parts.push(`${col} IS NULL`); continue; }
    if (f.operator === 'is_not_null') { parts.push(`${col} IS NOT NULL`); continue; }
    if (f.operator === 'contains') { parts.push(`${col}::text ILIKE $${idx++}`); params.push(`%${f.value}%`); }
    else if (f.operator === 'not_contains') { parts.push(`${col}::text NOT ILIKE $${idx++}`); params.push(`%${f.value}%`); }
    else { parts.push(`${col}::text ${op} $${idx++}`); params.push(String(f.value)); }
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params, nextIdx: idx };
};

const buildAggSQL = (datasetId, xKey, yKey, aggregation, filters, schema, limit = 50, offset = 0) => {
  const { clause, params } = buildWhereClause(filters, schema);
  let aggExpr;
  if (!yKey || aggregation === 'count') {
    aggExpr = 'COUNT(*) AS value';
  } else if (aggregation === 'median') {
    aggExpr = `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "${yKey}"::numeric) AS value`;
  } else {
    const fn = SAFE_AGG[aggregation] || 'COUNT';
    aggExpr = `${fn}("${yKey}"::numeric) AS value`;
  }
  const sql = `SELECT "${xKey}"::text AS label, ${aggExpr}
    FROM "data_${datasetId}"
    ${clause}
    GROUP BY "${xKey}"::text
    ORDER BY value DESC NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  return { sql, params: [...params, parseInt(limit), parseInt(offset)] };
};

// ═══════════════════════════════════════════════════════════════════════════
// POST /visualization/aggregate  — server-side aggregation (scalable)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/aggregate', authenticate, async (req, res) => {
  try {
    const { datasetId, xKey, yKey, aggregation = 'count', filters = [], limit = 50, offset = 0 } = req.body;
    if (!datasetId || !xKey) return res.status(400).json({ error: 'datasetId and xKey required' });

    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const schema = ds.rows[0].schema || [];

    if (!validateColumn(xKey, schema)) return res.status(400).json({ error: `Invalid column: ${xKey}` });
    if (yKey && !validateColumn(yKey, schema)) return res.status(400).json({ error: `Invalid column: ${yKey}` });

    const { sql, params } = buildAggSQL(datasetId, xKey, yKey, aggregation, filters, schema, limit, offset);

    // Total count for this grouping (for pagination)
    const { clause, params: cParams } = buildWhereClause(filters, schema);
    const countSQL = `SELECT COUNT(DISTINCT "${xKey}"::text) AS total FROM "data_${datasetId}" ${clause}`;
    const [result, countResult] = await Promise.all([pool.query(sql, params), pool.query(countSQL, cParams)]);

    // Also get total row count matching filters (for stats)
    const rowCountSQL = `SELECT COUNT(*) AS total_rows FROM "data_${datasetId}" ${clause}`;
    const rowCountResult = await pool.query(rowCountSQL, cParams);

    res.json({
      rows: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      totalRows: parseInt(rowCountResult.rows[0]?.total_rows || 0),
      datasetName: ds.rows[0].name,
      rowCount: ds.rows[0].row_count,
      schema: schema,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /visualization/drilldown  — click-through drill-down
// ═══════════════════════════════════════════════════════════════════════════
router.post('/drilldown', authenticate, async (req, res) => {
  try {
    const { datasetId, xKey, xValue, drillKey, yKey, aggregation = 'count', filters = [], limit = 50 } = req.body;
    if (!datasetId || !drillKey) return res.status(400).json({ error: 'datasetId and drillKey required' });

    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const schema = ds.rows[0].schema || [];

    if (!validateColumn(drillKey, schema)) return res.status(400).json({ error: `Invalid drillKey: ${drillKey}` });

    // Combine existing filters + the drill-through filter
    const allFilters = [...filters, ...(xKey && xValue !== undefined ? [{ column: xKey, operator: '=', value: xValue }] : [])];
    const { sql, params } = buildAggSQL(datasetId, drillKey, yKey, aggregation, allFilters, schema, limit, 0);
    const result = await pool.query(sql, params);

    res.json({ rows: result.rows, drillKey, xKey, xValue, datasetName: ds.rows[0].name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /visualization/scatter  — scatter plot data (server-side sampling)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/scatter', authenticate, async (req, res) => {
  try {
    const { datasetId, xKey, yKey, filters = [], limit = 2000 } = req.body;
    if (!datasetId || !xKey || !yKey) return res.status(400).json({ error: 'datasetId, xKey, yKey required' });

    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const schema = ds.rows[0].schema || [];

    if (!validateColumn(xKey, schema) || !validateColumn(yKey, schema)) return res.status(400).json({ error: 'Invalid columns' });

    const { clause, params } = buildWhereClause(filters, schema);
    const rowCount = ds.rows[0].row_count || 0;
    // Use tablesample for very large datasets
    const sample = rowCount > 100000 ? `TABLESAMPLE SYSTEM(${Math.min(100, Math.ceil(limit / rowCount * 100 + 5))})` : '';
    const sql = `SELECT "${xKey}"::numeric AS x, "${yKey}"::numeric AS y FROM "data_${datasetId}" ${sample} ${clause} WHERE "${xKey}" IS NOT NULL AND "${yKey}" IS NOT NULL LIMIT $${params.length + 1}`;

    const result = await pool.query(sql, [...params, parseInt(limit)]);
    res.json({ rows: result.rows.filter(r => r.x !== null && r.y !== null), datasetName: ds.rows[0].name, sampled: rowCount > 100000 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /visualization/distinct/:datasetId/:col  — get distinct values for filter
// ═══════════════════════════════════════════════════════════════════════════
router.get('/distinct/:datasetId/:col', authenticate, async (req, res) => {
  try {
    const { datasetId, col } = req.params;
    const ds = await pool.query('SELECT schema FROM datasets WHERE id=$1', [datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!validateColumn(col, ds.rows[0].schema)) return res.status(400).json({ error: 'Invalid column' });

    const result = await pool.query(`SELECT DISTINCT "${col}"::text AS val FROM "data_${datasetId}" WHERE "${col}" IS NOT NULL ORDER BY val LIMIT 200`);
    res.json(result.rows.map(r => r.val));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET  /visualization/charts       — list saved charts (from DB)
// POST /visualization/charts       — save chart
// DELETE /visualization/charts/:id — delete chart
// ═══════════════════════════════════════════════════════════════════════════
router.get('/charts', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT sc.*, d.name AS dataset_name, u.name AS creator_name
       FROM saved_charts sc
       LEFT JOIN datasets d ON sc.dataset_id = d.id
       LEFT JOIN users u ON sc.user_id = u.id
       WHERE sc.user_id = $1 OR $2 = 'admin'
       ORDER BY sc.created_at DESC`,
      [req.user.id, req.user.role]
    );
    res.json(r.rows);
  } catch (err) {
    if (err.message.includes('does not exist')) return res.json([]); // table not yet created
    res.status(500).json({ error: err.message });
  }
});

router.post('/charts', authenticate, async (req, res) => {
  try {
    const { name, datasetId, config, filters = [], lineageSnapshot = {} } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const ds = datasetId ? await pool.query('SELECT name FROM datasets WHERE id=$1', [datasetId]) : { rows: [] };
    const r = await pool.query(
      `INSERT INTO saved_charts (name, dataset_id, dataset_name, config, filters, user_id, lineage_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, datasetId || null, ds.rows[0]?.name || null, JSON.stringify(config || {}), JSON.stringify(filters), req.user.id, JSON.stringify(lineageSnapshot)]
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.message.includes('does not exist')) return res.status(503).json({ error: 'saved_charts table not yet created — run migrations' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/charts/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM saved_charts WHERE id=$1 AND (user_id=$2 OR $3=\'admin\')', [req.params.id, req.user.id, req.user.role]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /visualization/governance/:datasetId  — governance context for charting
// ═══════════════════════════════════════════════════════════════════════════
router.get('/governance/:datasetId', authenticate, async (req, res) => {
  try {
    const dsId = req.params.datasetId;
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [dsId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });

    const schema = ds.rows[0].schema || [];
    const cols = Array.isArray(schema) ? schema : Object.entries(schema).map(([n, t]) => ({ name: n, type: t }));

    // Get masking rules
    const masking = await pool.query('SELECT column_name, mask_type FROM masking_rules WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [] }));
    const maskMap = {};
    masking.rows.forEach(r => { maskMap[r.column_name] = r.mask_type; });

    // Get latest dataset version
    const ver = await pool.query('SELECT id, description, created_at FROM dataset_versions WHERE dataset_id=$1 ORDER BY id DESC LIMIT 1', [dsId]).catch(() => ({ rows: [] }));

    // PII columns
    const piiCols = cols.filter(c => {
      const n = c.name.toLowerCase();
      return /email|phone|ssn|name|address|dob|birth|gender|salary|wage|income|credit|passport/.test(n);
    });

    // Queries/reports built from this dataset
    const queryCount = await pool.query('SELECT COUNT(*) as n FROM queries WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [{ n: 0 }] }));
    const reportCount = await pool.query('SELECT COUNT(*) as n FROM reports WHERE dataset_id=$1', [dsId]).catch(() => ({ rows: [{ n: 0 }] }));

    res.json({
      datasetId: parseInt(dsId),
      datasetName: ds.rows[0].name,
      rowCount: ds.rows[0].row_count,
      createdAt: ds.rows[0].created_at,
      latestVersion: ver.rows[0] || null,
      piiColumns: piiCols.map(c => ({ name: c.name, masked: !!maskMap[c.name], maskType: maskMap[c.name] || null })),
      maskedCount: masking.rows.length,
      totalColumns: cols.length,
      queryCount: parseInt(queryCount.rows[0]?.n || 0),
      reportCount: parseInt(reportCount.rows[0]?.n || 0),
      complianceWarnings: piiCols.filter(c => !maskMap[c.name]).map(c => `"${c.name}" is PII and unmasked`),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /visualization/powerbi/:datasetId  — Power BI compatible JSON export
// ═══════════════════════════════════════════════════════════════════════════
router.get('/powerbi/:datasetId', authenticate, async (req, res) => {
  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.datasetId]);
    if (!ds.rows.length) return res.status(404).json({ error: 'Not found' });
    const dataset = ds.rows[0];

    const schema = Array.isArray(dataset.schema) ? dataset.schema : Object.entries(dataset.schema || {}).map(([n, t]) => ({ name: n, type: t }));
    const rows = await pool.query(`SELECT * FROM "data_${dataset.id}" ORDER BY row_index LIMIT 100000`);
    const dataRows = rows.rows.map(r => { const { row_index, ...rest } = r; return rest; });

    // Power BI REST API compatible dataset definition
    const powerBiExport = {
      name: dataset.name,
      tables: [{
        name: dataset.name.replace(/[^a-zA-Z0-9_]/g, '_'),
        columns: schema.map(c => ({
          name: c.name,
          dataType: (['numeric', 'integer', 'float', 'decimal'].includes(String(c.type).toLowerCase())) ? 'Double' : 'String',
        })),
        rows: dataRows,
      }],
      relationships: [],
    };

    const fileName = `${dataset.name.replace(/[^a-zA-Z0-9_]/g, '_')}_powerbi.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(powerBiExport);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /visualization/embed/:chartId  — embeddable snippet
// ═══════════════════════════════════════════════════════════════════════════
router.get('/embed/:chartId', authenticate, async (req, res) => {
  try {
    const chart = await pool.query('SELECT * FROM saved_charts WHERE id=$1', [req.params.chartId]);
    if (!chart.rows.length) return res.status(404).json({ error: 'Chart not found' });
    const c = chart.rows[0];
    const host = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000';
    const iframeCode = `<iframe src="${host}/visualization?chart=${c.id}" width="800" height="500" frameborder="0" style="border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.3);"></iframe>`;
    const apiSnippet = `// Fetch chart data via API\nconst res = await fetch('/api/visualization/charts', {\n  headers: { Authorization: 'Bearer YOUR_TOKEN' }\n});\nconst charts = await res.json();\nconst chart = charts.find(c => c.id === ${c.id});`;
    res.json({ chartId: c.id, name: c.name, iframeCode, apiSnippet, config: c.config });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
