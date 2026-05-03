const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const run = async () => {
  console.log('🌱 Seeding all missing feature data...\n');

  // ── 1. CATALOG ENTRIES ─────────────────────────────────────────────────────
  const datasets = [
    { id:1, tags:['sales','revenue','2023'], desc:'Monthly sales performance data across regions, products, and channels', owner:'Demo Admin', domain:'Sales', sensitivity:'internal', lineage:['CRM Export','ERP System'] },
    { id:2, tags:['hr','employees','attrition'], desc:'HR employee records including salary, performance, and attrition data', owner:'Jane Analyst', domain:'Human Resources', sensitivity:'restricted', lineage:['HRIS System','Payroll'] },
    { id:3, tags:['finance','stocks','time-series'], desc:'Daily financial time series with OHLCV data and market cap', owner:'Demo Admin', domain:'Finance', sensitivity:'public', lineage:['Market Data Feed'] },
    { id:4, tags:['ecommerce','orders','customers'], desc:'E-commerce order data with customer segments and product categories', owner:'Demo Admin', domain:'Sales', sensitivity:'internal', lineage:['Shopify Export'] },
    { id:5, tags:['marketing','campaigns','roi'], desc:'Marketing campaign performance with spend, impressions, and conversions', owner:'Jane Analyst', domain:'Marketing', sensitivity:'internal', lineage:['Google Ads','Meta Ads'] },
    { id:6, tags:['iot','sensors','telemetry'], desc:'IoT sensor telemetry data with temperature, humidity and anomaly flags', owner:'Demo Admin', domain:'Operations', sensitivity:'internal', lineage:['IoT Platform'] },
    { id:7, tags:['churn','classification','ml'], desc:'Customer churn analytics dataset used for ML classification models', owner:'Jane Analyst', domain:'Customer Success', sensitivity:'restricted', lineage:['Salesforce','Billing System'] },
  ];
  for (const d of datasets) {
    await pool.query(
      `INSERT INTO catalog_entries (dataset_id, tags, description, owner, domain, sensitivity, lineage, custom_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [d.id, d.tags, d.desc, d.owner, d.domain, d.sensitivity, JSON.stringify(d.lineage), JSON.stringify({ quality_score: Math.floor(70 + Math.random()*30), last_reviewed: new Date().toISOString() })]
    ).catch(e => console.log('catalog err:', e.message));
  }
  console.log('✅ Catalog entries (7)');

  // ── 2. GEO LAYERS ──────────────────────────────────────────────────────────
  const geoLayers = [
    { name:'Sales by Region', dataset_id:1, lat_col:'latitude', lng_col:'longitude', value_col:'revenue', layer_type:'heatmap' },
    { name:'Store Locations', dataset_id:4, lat_col:'latitude', lng_col:'longitude', value_col:'order_value', layer_type:'marker' },
    { name:'IoT Sensor Network', dataset_id:6, lat_col:'latitude', lng_col:'longitude', value_col:'temperature', layer_type:'circle' },
  ];
  for (const g of geoLayers) {
    await pool.query(
      `INSERT INTO geo_layers (name, dataset_id, lat_col, lng_col, value_col, layer_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [g.name, g.dataset_id, g.lat_col, g.lng_col, g.value_col, g.layer_type, 1]
    ).catch(e => console.log('geo err:', e.message));
  }
  console.log('✅ Geo layers (3)');

  // ── 3. LINEAGE NODES & EDGES ───────────────────────────────────────────────
  const nodes = [
    { node_id:'ds_1', node_type:'dataset', label:'Sales Performance 2023', dataset_id:1, meta:{source:'CRM Export',rows:500} },
    { node_id:'ds_2', node_type:'dataset', label:'HR Employee Analytics', dataset_id:2, meta:{source:'HRIS',rows:300} },
    { node_id:'ds_3', node_type:'dataset', label:'Financial Time Series', dataset_id:3, meta:{source:'Market Feed',rows:365} },
    { node_id:'q_1', node_type:'query', label:'Revenue by Region Query', meta:{sql:'SELECT region,SUM(revenue) FROM data_1 GROUP BY region'} },
    { node_id:'q_2', node_type:'query', label:'Monthly Sales Trend', meta:{sql:'SELECT date,SUM(revenue) FROM data_1 GROUP BY date ORDER BY date'} },
    { node_id:'r_1', node_type:'report', label:'Q4 Sales Report', meta:{generated:'2023-12-31'} },
    { node_id:'r_2', node_type:'report', label:'HR Attrition Analysis', meta:{generated:'2024-01-15'} },
    { node_id:'v_1', node_type:'version', label:'Sales v2 (Cleaned)', meta:{parent:'ds_1',change:'Removed duplicates'} },
    { node_id:'rc_1', node_type:'recipe', label:'Data Cleaning Recipe', meta:{steps:['trim_strings','remove_duplicates']} },
  ];
  for (const n of nodes) {
    await pool.query(
      `INSERT INTO lineage_nodes (node_id, node_type, label, dataset_id, metadata) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (node_id) DO NOTHING`,
      [n.node_id, n.node_type, n.label, n.dataset_id||null, JSON.stringify(n.meta)]
    ).catch(e => console.log('lineage node err:', e.message));
  }
  const edges = [
    { src:'ds_1', tgt:'q_1', rel:'queried_by' },
    { src:'ds_1', tgt:'q_2', rel:'queried_by' },
    { src:'q_1', tgt:'r_1', rel:'included_in' },
    { src:'q_2', tgt:'r_1', rel:'included_in' },
    { src:'ds_2', tgt:'r_2', rel:'included_in' },
    { src:'ds_1', tgt:'v_1', rel:'versioned_as' },
    { src:'rc_1', tgt:'v_1', rel:'transformed_by' },
    { src:'v_1', tgt:'r_1', rel:'included_in' },
  ];
  for (const e of edges) {
    await pool.query(
      `INSERT INTO lineage_edges (source_node, target_node, relationship) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [e.src, e.tgt, e.rel]
    ).catch(err => console.log('lineage edge err:', err.message));
  }
  console.log('✅ Lineage nodes (9) + edges (8)');

  // ── 4. AUDIT LOGS ──────────────────────────────────────────────────────────
  const actions = [
    {uid:1,action:'login',rt:'auth',det:{ip:'192.168.1.1',browser:'Chrome'}},
    {uid:1,action:'dataset_upload',rt:'dataset',rid:'1',det:{name:'Sales Performance 2023',rows:500}},
    {uid:1,action:'query_execute',rt:'query',rid:'1',det:{sql:'SELECT * FROM data_1 LIMIT 10',rows:10}},
    {uid:2,action:'login',rt:'auth',det:{ip:'10.0.0.5',browser:'Firefox'}},
    {uid:2,action:'report_generate',rt:'report',rid:'1',det:{title:'Q4 Sales Report'}},
    {uid:1,action:'dataset_export',rt:'dataset',rid:'1',det:{format:'csv',rows:500}},
    {uid:1,action:'ml_run',rt:'analytics',rid:'1',det:{model:'regression',target:'revenue'}},
    {uid:2,action:'dashboard_create',rt:'dashboard',rid:'1',det:{name:'Sales Overview'}},
    {uid:1,action:'api_key_create',rt:'api_key',det:{name:'Production Key'}},
    {uid:1,action:'query_execute',rt:'query',rid:'2',det:{sql:'SELECT region, SUM(revenue) FROM data_1 GROUP BY region',rows:5}},
    {uid:2,action:'dataset_view',rt:'dataset',rid:'2',det:{name:'HR Employee Analytics'}},
    {uid:1,action:'cleaning_apply',rt:'dataset',rid:'1',det:{operation:'remove_duplicates',removed:3}},
    {uid:1,action:'automl_run',rt:'analytics',rid:'7',det:{model:'Random Forest',target:'churned'}},
    {uid:2,action:'query_execute',rt:'query',rid:'3',det:{sql:'SELECT department, COUNT(*) FROM data_2 GROUP BY department',rows:8}},
    {uid:1,action:'webhook_trigger',rt:'webhook',rid:'1',det:{url:'https://hooks.example.com',status:200}},
    {uid:1,action:'dataset_export',rt:'dataset',rid:'2',det:{format:'csv',rows:300}},
    {uid:2,action:'annotation_create',rt:'annotation',rid:'1',det:{column:'revenue',content:'Outlier detected'}},
    {uid:1,action:'narrate_generate',rt:'report',rid:'1',det:{sections:6}},
    {uid:1,action:'pivot_compute',rt:'analytics',rid:'1',det:{rows:['region'],cols:['channel'],agg:'sum'}},
    {uid:2,action:'login',rt:'auth',det:{ip:'10.0.0.5',browser:'Safari'}},
    {uid:1,action:'workspace_create',rt:'workspace',det:{name:'Analytics Team',plan:'pro'}},
    {uid:1,action:'connector_create',rt:'connector',det:{name:'Production DB',type:'postgresql'}},
    {uid:1,action:'recipe_apply',rt:'recipe',rid:'1',det:{dataset:'Sales Performance 2023',steps:3}},
    {uid:2,action:'nl_query',rt:'query',det:{question:'total revenue by region',confidence:0.85}},
    {uid:1,action:'dataset_upload',rt:'dataset',rid:'7',det:{name:'Customer Churn Analytics',rows:1000}},
    {uid:1,action:'tfa_setup',rt:'auth',det:{method:'TOTP'}},
    {uid:2,action:'share_create',rt:'share',rid:'1',det:{resource:'dataset',target:'analyst@dataanalyst.com'}},
    {uid:1,action:'pipeline_run',rt:'pipeline',rid:'1',det:{status:'success',rows:500}},
    {uid:1,action:'job_run',rt:'job',rid:'1',det:{type:'profiling',status:'success'}},
    {uid:1,action:'masking_apply',rt:'dataset',rid:'1',det:{column:'email',type:'email'}},
  ];
  for (const a of actions) {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, created_at)
       VALUES ($1,$2,$3,$4,$5,$6, NOW() - INTERVAL '${Math.floor(Math.random()*30)} days' - INTERVAL '${Math.floor(Math.random()*24)} hours')`,
      [a.uid, a.action, a.rt, a.rid||null, JSON.stringify(a.det), `192.168.${Math.floor(Math.random()*5)}.${Math.floor(Math.random()*255)}`]
    ).catch(e => console.log('audit err:', e.message));
  }
  console.log('✅ Audit logs (30)');

  // ── 5. CONNECTORS ──────────────────────────────────────────────────────────
  const connectors = [
    { name:'Analytics Data Warehouse', type:'postgresql', config:{host:'analytics.company.com',port:5432,database:'datawarehouse',user:'readonly',password:'***stored***'}, status:'active' },
    { name:'Marketing MySQL DB', type:'mysql', config:{host:'mysql.marketing.internal',port:3306,database:'campaigns',user:'analyst',password:'***stored***'}, status:'active' },
    { name:'Google BigQuery', type:'bigquery', config:{projectId:'my-analytics-project',defaultDataset:'prod_data'}, status:'active' },
    { name:'S3 Sales CSV', type:'csv_url', config:{url:'https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv'}, status:'active' },
  ];
  for (const c of connectors) {
    await pool.query(
      `INSERT INTO connectors (name, type, config, status, last_tested, created_by) VALUES ($1,$2,$3,$4,NOW(),$5) ON CONFLICT DO NOTHING`,
      [c.name, c.type, JSON.stringify(c.config), c.status, 1]
    ).catch(e => console.log('connector err:', e.message));
  }
  console.log('✅ Connectors (4)');

  // ── 6. PIPELINES ───────────────────────────────────────────────────────────
  const pipelines = [
    {
      name: 'Sales Data Cleaning Pipeline',
      desc: 'Removes duplicates, fills missing values, and trims whitespace from sales data',
      steps: [
        {operation:'remove_duplicates',parameters:{}},
        {operation:'trim_strings',parameters:{}},
        {operation:'fill_missing',parameters:{strategy:'mean',columns:['revenue','quantity']}}
      ],
      src: {dataset_id:1},
      dst: {dataset_id:1},
      is_active: true
    },
    {
      name: 'HR Analytics Normalization',
      desc: 'Normalizes salary column and drops rows with missing department data',
      steps: [
        {operation:'normalize',parameters:{column:'salary',method:'minmax'}},
        {operation:'drop_missing_rows',parameters:{columns:['department']}}
      ],
      src: {dataset_id:2},
      dst: {dataset_id:2},
      is_active: true
    },
    {
      name: 'Financial Data Quality Check',
      desc: 'Cleans financial time series by removing duplicates and filling gaps',
      steps: [
        {operation:'remove_duplicates',parameters:{}},
        {operation:'fill_missing',parameters:{strategy:'mean',columns:['close','volume']}}
      ],
      src: {dataset_id:3},
      dst: {dataset_id:3},
      is_active: false
    },
  ];
  for (const p of pipelines) {
    await pool.query(
      `INSERT INTO pipelines (name, description, steps, source_config, destination_config, is_active, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.name, p.desc, JSON.stringify(p.steps), JSON.stringify(p.src), JSON.stringify(p.dst), p.is_active, 1]
    ).catch(e => console.log('pipeline err:', e.message));
  }
  console.log('✅ Pipelines (3)');

  // ── 7. JOBS ────────────────────────────────────────────────────────────────
  const jobs = [
    {name:'Daily Sales Profiling', job_type:'profile', config:{checks:['nulls','outliers','duplicates']}, schedule_cron:'0 6 * * *', schedule_description:'Every day at 6am', dataset_id:1},
    {name:'Weekly HR Report', job_type:'sql_query', config:{sql:'SELECT department, COUNT(*) as employees, AVG(salary::numeric) as avg_salary FROM data_2 GROUP BY department'}, schedule_cron:'0 9 * * 1', schedule_description:'Every Monday at 9am', dataset_id:2},
    {name:'Monthly Churn Model', job_type:'profile', config:{model:'classification',target:'churned'}, schedule_cron:'0 8 1 * *', schedule_description:'First of every month', dataset_id:7},
    {name:'Financial Data Refresh', job_type:'sql_query', config:{sql:'SELECT date, close, volume FROM data_3 ORDER BY date DESC LIMIT 30'}, schedule_cron:'0 */4 * * *', schedule_description:'Every 4 hours', dataset_id:3},
  ];
  for (const j of jobs) {
    await pool.query(
      `INSERT INTO jobs (name, job_type, config, schedule_cron, schedule_description, dataset_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [j.name, j.job_type, JSON.stringify(j.config), j.schedule_cron, j.schedule_description, j.dataset_id, 1]
    ).catch(e => console.log('job err:', e.message));
  }
  console.log('✅ Jobs (4)');

  // ── 8. ALERTS ──────────────────────────────────────────────────────────────
  const alerts = [
    {name:'Low Revenue Alert', dataset_id:1, condition_sql:"SELECT SUM(revenue::numeric) FROM dataset WHERE date >= CURRENT_DATE - INTERVAL '7 days'", threshold_value:50000, comparison_operator:'<', notification_channel:'in_app'},
    {name:'High Attrition Alert', dataset_id:2, condition_sql:"SELECT COUNT(*) FROM dataset WHERE attrition='Yes'", threshold_value:50, comparison_operator:'>', notification_channel:'in_app'},
    {name:'IoT Temperature Alert', dataset_id:6, condition_sql:'SELECT MAX(temperature::numeric) FROM dataset', threshold_value:85, comparison_operator:'>', notification_channel:'in_app'},
  ];
  for (const a of alerts) {
    await pool.query(
      `INSERT INTO alerts (name, dataset_id, condition_sql, threshold_value, comparison_operator, notification_channel, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.name, a.dataset_id, a.condition_sql, a.threshold_value, a.comparison_operator, a.notification_channel, 1]
    ).catch(e => console.log('alert err:', e.message));
  }
  console.log('✅ Alerts (3)');

  // ── 9. WORKSPACES (seed members) ──────────────────────────────────────────
  const ws = await pool.query('SELECT id FROM workspaces WHERE owner_id=1 LIMIT 1');
  if (ws.rows.length) {
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [ws.rows[0].id, 2, 'analyst']
    ).catch(() => {});
  }
  // Create a second workspace
  const ws2 = await pool.query(`INSERT INTO workspaces (name, slug, owner_id, plan, description) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
    ['Finance & Risk Team', 'finance-risk-team', 1, 'enterprise', 'Dedicated workspace for finance analytics and risk modeling']
  ).catch(() => ({rows:[]}));
  if (ws2?.rows?.[0]?.id) {
    await pool.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [ws2.rows[0].id, 2, 'admin']).catch(()=>{});
  }
  console.log('✅ Workspaces seeded');

  // ── 10. RECIPES (add rich demo recipes) ───────────────────────────────────
  const recipes = [
    {
      name:'Standard Data Cleanup', desc:'Remove duplicates, trim whitespace, fill numeric nulls with mean',
      steps:[{operation:'remove_duplicates',parameters:{}},{operation:'trim_strings',parameters:{}},{operation:'fill_missing',parameters:{strategy:'mean',columns:[]}}],
      tags:['cleaning','standard'], is_public:true
    },
    {
      name:'Normalize + Drop Nulls', desc:'Drop rows with any missing values then min-max normalize all numeric columns',
      steps:[{operation:'drop_missing_rows',parameters:{columns:[]}},{operation:'normalize',parameters:{method:'minmax'}}],
      tags:['normalization','ml-prep'], is_public:true
    },
  ];
  for (const r of recipes) {
    await pool.query(
      `INSERT INTO recipes (name, description, steps, tags, created_by, is_public) VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.name, r.desc, JSON.stringify(r.steps), r.tags, 1, r.is_public]
    ).catch(e => console.log('recipe err:', e.message));
  }
  console.log('✅ Recipes (2 added)');

  // ── 11. WEBHOOKS (add more) ────────────────────────────────────────────────
  const webhooks = [
    {name:'Revenue Threshold Alert', url:'https://hooks.slack.com/services/demo/alert', method:'POST', event_type:'threshold', threshold_column:'revenue', threshold_value:5000, threshold_operator:'>', is_active:true, dataset_id:1},
    {name:'Pipeline Complete Notification', url:'https://api.example.com/notify', method:'POST', event_type:'pipeline_complete', is_active:true},
    {name:'New Dataset Hook', url:'https://api.example.com/datasets/new', method:'POST', event_type:'dataset_upload', is_active:false},
  ];
  for (const w of webhooks) {
    await pool.query(
      `INSERT INTO webhooks (name, url, method, event_type, threshold_column, threshold_value, threshold_operator, is_active, dataset_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [w.name, w.url, w.method||'POST', w.event_type, w.threshold_column||null, w.threshold_value||null, w.threshold_operator||null, w.is_active, w.dataset_id||null, 1]
    ).catch(e => console.log('webhook err:', e.message));
  }
  console.log('✅ Webhooks (3 added)');

  // ── 12. SCENARIOS ─────────────────────────────────────────────────────────
  const scenarios = [
    {name:'Revenue Increase 15%', desc:'Model effect of 15% price increase across all products', dataset_id:1, variables:[{name:'price_multiplier',value:1.15,type:'multiplier'}], assumptions:{market_growth:0.05,churn_rate:0.02}},
    {name:'Staff Reduction 10%', desc:'Impact of reducing headcount by 10% on department performance', dataset_id:2, variables:[{name:'headcount_reduction',value:0.1,type:'ratio'}], assumptions:{productivity_gain:0.05}},
    {name:'Marketing Spend +25%', desc:'Projected campaign performance with 25% budget increase', dataset_id:5, variables:[{name:'budget_multiplier',value:1.25,type:'multiplier'}], assumptions:{cpa_improvement:0.15}},
  ];
  for (const s of scenarios) {
    await pool.query(`UPDATE scenarios SET dataset_id=$1, variables=$2::jsonb, assumptions=$3::jsonb WHERE name=$4`,
      [s.dataset_id, JSON.stringify(s.variables), JSON.stringify(s.assumptions), s.name]
    ).catch(() => {});
    // If no existing scenario, insert
    const ex = await pool.query('SELECT id FROM scenarios WHERE name=$1', [s.name]);
    if (!ex.rows.length) {
      await pool.query(`INSERT INTO scenarios (name, description, dataset_id, variables, assumptions, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.name, s.desc, s.dataset_id, JSON.stringify(s.variables), JSON.stringify(s.assumptions), 1]
      ).catch(e => console.log('scenario err:', e.message));
    }
  }
  console.log('✅ Scenarios seeded');

  // ── 13. COMMENTS (seed realistic comments) ────────────────────────────────
  const existingComments = await pool.query('SELECT COUNT(*) FROM comments');
  if (parseInt(existingComments.rows[0].count) < 3) {
    const comments = [
      {uid:1, target_type:'dataset', target_id:'1', content:'Revenue looks lower than expected in Q3. Need to investigate the South region numbers.'},
      {uid:2, target_type:'dataset', target_id:'1', content:'I think this is due to the supply chain disruption in July. Matches our CRM notes.'},
      {uid:1, target_type:'dataset', target_id:'2', content:'Attrition rate in Engineering is concerning — 23% vs 12% company average.'},
      {uid:2, target_type:'dataset', target_id:'2', content:'Should we run a clustering analysis to identify at-risk employees?'},
      {uid:1, target_type:'dataset', target_id:'7', content:'Churn model accuracy at 87% — this is production-ready.'},
    ];
    for (const c of comments) {
      await pool.query(`INSERT INTO comments (user_id, target_type, target_id, content) VALUES ($1,$2,$3,$4)`, [c.uid, c.target_type, c.target_id, c.content]).catch(()=>{});
    }
    console.log('✅ Comments seeded');
  } else {
    console.log('✅ Comments already exist');
  }

  // ── 14. ANNOTATIONS (seed more) ───────────────────────────────────────────
  const existingAnns = await pool.query('SELECT COUNT(*) FROM annotations');
  if (parseInt(existingAnns.rows[0].count) < 5) {
    const anns = [
      {uid:1, dataset_id:1, row_index:null, column_name:'revenue', content:'Revenue column includes all discounts. Net revenue is ~8% lower.', annotation_type:'note'},
      {uid:2, dataset_id:1, row_index:null, column_name:'discount', content:'Discounts above 0.3 are approved by VP Sales only.', annotation_type:'business_rule'},
      {uid:1, dataset_id:2, row_index:null, column_name:'salary', content:'Salary data is as of hire date — not current compensation.', annotation_type:'warning'},
      {uid:1, dataset_id:7, row_index:null, column_name:'churned', content:'Churn is defined as no activity for 90+ days.', annotation_type:'definition'},
    ];
    for (const a of anns) {
      await pool.query(`INSERT INTO annotations (user_id, dataset_id, row_index, column_name, content, annotation_type) VALUES ($1,$2,$3,$4,$5,$6)`, [a.uid, a.dataset_id, a.row_index, a.column_name, a.content, a.annotation_type]).catch(()=>{});
    }
    console.log('✅ Annotations seeded');
  } else {
    console.log('✅ Annotations already exist');
  }

  // ── 15. NL_QUERIES history ─────────────────────────────────────────────────
  const nlExisting = await pool.query('SELECT COUNT(*) FROM nl_queries');
  if (parseInt(nlExisting.rows[0].count) < 5) {
    const nlqs = [
      {uid:1, ds:1, txt:'Show me total revenue by region', sql:"SELECT \"region\", SUM(\"revenue\") AS sum_revenue FROM data_1 GROUP BY \"region\" ORDER BY SUM(\"revenue\") DESC LIMIT 100", conf:0.85},
      {uid:1, ds:1, txt:'Top 5 products by profit', sql:"SELECT \"product\", SUM(\"profit\") AS sum_profit FROM data_1 GROUP BY \"product\" ORDER BY SUM(\"profit\") DESC LIMIT 5", conf:0.9},
      {uid:2, ds:2, txt:'Average salary by department', sql:"SELECT \"department\", AVG(\"salary\") AS avg_salary FROM data_2 GROUP BY \"department\" ORDER BY AVG(\"salary\") DESC LIMIT 100", conf:0.88},
      {uid:1, ds:3, txt:'Monthly average closing price', sql:"SELECT DATE_TRUNC('month', \"date\") AS month, AVG(\"close\") AS avg_close FROM data_3 GROUP BY DATE_TRUNC('month', \"date\") ORDER BY AVG(\"close\") DESC LIMIT 100", conf:0.82},
    ];
    for (const q of nlqs) {
      await pool.query(`INSERT INTO nl_queries (user_id, dataset_id, natural_text, generated_sql, confidence) VALUES ($1,$2,$3,$4,$5)`, [q.uid, q.ds, q.txt, q.sql, q.conf]).catch(()=>{});
    }
    console.log('✅ NL query history seeded');
  }

  await pool.end();
  console.log('\n🎉 All seeding complete!');
};

run().catch(e => { console.error('SEED ERROR:', e.message); pool.end(); });
