const pool = require('./db/pool');

const run = async () => {
  // Insert all lineage nodes
  const nodes = [
    ['dataset',  '1',    'Sales Performance 2023',    { source: 'CRM Export', rows: 500 }],
    ['dataset',  '2',    'HR Employee Analytics',     { source: 'HRIS', rows: 300 }],
    ['dataset',  '3',    'Financial Time Series',     { source: 'Market Feed', rows: 365 }],
    ['dataset',  '7',    'Customer Churn Analytics',  { source: 'Salesforce', rows: 1000 }],
    ['query',    'q_rev','Revenue by Region Query',   { sql: 'SELECT region,SUM(revenue) FROM data_1 GROUP BY region' }],
    ['query',    'q_hr', 'HR Department Analysis',   { sql: 'SELECT department,COUNT(*) FROM data_2 GROUP BY department' }],
    ['report',   'r_1',  'Q4 Sales Report',           { generated: '2023-12-31', sections: 6 }],
    ['report',   'r_2',  'Churn Analysis Report',     { generated: '2024-01-15', sections: 4 }],
    ['recipe',   'rc_1', 'Standard Data Cleanup',     { steps: 3 }],
    ['version',  'v_1',  'Sales v2 Cleaned',          { parent: 'dataset_1', change: 'Removed duplicates' }],
  ];

  const nodeIds = {};
  for (const [type, nid, name, meta] of nodes) {
    // Check if already exists
    const ex = await pool.query(
      'SELECT id FROM lineage_nodes WHERE node_type=$1 AND node_id=$2',
      [type, nid]
    );
    if (ex.rows.length) {
      nodeIds[nid] = ex.rows[0].id;
      console.log(`  exists: ${name} → id=${ex.rows[0].id}`);
      continue;
    }
    const r = await pool.query(
      'INSERT INTO lineage_nodes (node_type, node_id, node_name, metadata) VALUES ($1,$2,$3,$4) RETURNING id',
      [type, nid, name, JSON.stringify(meta)]
    );
    nodeIds[nid] = r.rows[0].id;
    console.log(`  inserted: ${name} → id=${r.rows[0].id}`);
  }

  console.log('\nNode ID map:', nodeIds);

  // Insert edges
  const edgePairs = [
    ['1',    'q_rev', 'queried_by'],
    ['1',    'r_1',   'included_in'],
    ['2',    'q_hr',  'queried_by'],
    ['2',    'r_1',   'included_in'],
    ['7',    'r_2',   'included_in'],
    ['1',    'v_1',   'versioned_as'],
    ['rc_1', 'v_1',   'transformed_by'],
    ['3',    'r_1',   'included_in'],
  ];

  let edgeCount = 0;
  for (const [src, tgt, rel] of edgePairs) {
    const srcId = nodeIds[src];
    const tgtId = nodeIds[tgt];
    if (!srcId || !tgtId) {
      console.log(`  SKIP edge ${src}->${tgt}: missing ids (src=${srcId}, tgt=${tgtId})`);
      continue;
    }
    const ex = await pool.query(
      'SELECT id FROM lineage_edges WHERE source_id=$1 AND target_id=$2',
      [srcId, tgtId]
    );
    if (ex.rows.length) {
      console.log(`  edge exists: ${src}->${tgt}`);
      continue;
    }
    await pool.query(
      'INSERT INTO lineage_edges (source_id, target_id, edge_type) VALUES ($1,$2,$3)',
      [srcId, tgtId, rel]
    );
    console.log(`  edge inserted: ${src}->${tgt} (${rel})`);
    edgeCount++;
  }

  console.log(`\n✅ Lineage: nodes=${Object.keys(nodeIds).length}, new edges=${edgeCount}`);

  // Verify
  const [nc, ec] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM lineage_nodes'),
    pool.query('SELECT COUNT(*) FROM lineage_edges'),
  ]);
  console.log(`   DB total: nodes=${nc.rows[0].count}, edges=${ec.rows[0].count}`);

  await pool.end();
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
