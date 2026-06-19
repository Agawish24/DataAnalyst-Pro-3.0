// Comprehensive Neon DB initializer: creates all 54 tables + seeds all demo data
// Usage: NEON_URL="postgresql://..." node server/neon_init.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const NEON_URL = process.env.NEON_URL || process.argv[2];
if (!NEON_URL) { console.error('Usage: NEON_URL="postgresql://..." node server/neon_init.js'); process.exit(1); }

const pool = new Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });
const q = (sql, params) => pool.query(sql, params);
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rndF = (min, max, dp = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(dp));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

async function createSchema() {
  console.log('📦 Creating schema...');

  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, role TEXT DEFAULT 'analyst',
    bio TEXT DEFAULT '', avatar_color TEXT DEFAULT '#6366f1',
    email_verified BOOLEAN DEFAULT false, verification_token TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS datasets (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    filename TEXT, row_count INTEGER DEFAULT 0, schema JSONB DEFAULT '[]',
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}', source TEXT DEFAULT 'upload',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS queries (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    dataset_id INTEGER, sql_text TEXT NOT NULL, result_rows INTEGER DEFAULT 0,
    execution_time_ms INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS dashboards (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    config JSONB DEFAULT '{}', created_by INTEGER REFERENCES users(id),
    is_public BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS ai_conversations (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    dataset_id INTEGER, messages JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS data_cleaning_jobs (
    id SERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    operation TEXT NOT NULL, parameters JSONB DEFAULT '{}',
    rows_before INTEGER DEFAULT 0, rows_after INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending', error_message TEXT,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS dataset_versions (
    id SERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL, snapshot_table TEXT NOT NULL,
    change_summary TEXT DEFAULT '', row_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    steps JSONB DEFAULT '[]', tags TEXT[] DEFAULT '{}',
    created_by INTEGER REFERENCES users(id), is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS recipe_applications (
    id SERIAL PRIMARY KEY, recipe_id INTEGER REFERENCES recipes(id),
    dataset_id INTEGER REFERENCES datasets(id), applied_by INTEGER REFERENCES users(id),
    result JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS catalog_entries (
    id SERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    tags TEXT[] DEFAULT '{}', description TEXT DEFAULT '', owner TEXT DEFAULT '',
    domain TEXT DEFAULT '', sensitivity TEXT DEFAULT 'internal',
    lineage JSONB DEFAULT '[]', custom_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS pipelines (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    steps JSONB DEFAULT '[]', source_config JSONB DEFAULT '{}',
    destination_config JSONB DEFAULT '{}', is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS pipeline_runs (
    id SERIAL PRIMARY KEY, pipeline_id INTEGER REFERENCES pipelines(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', rows_processed INTEGER DEFAULT 0,
    error_message TEXT, started_at TIMESTAMP DEFAULT NOW(), finished_at TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS quality_checks (
    id SERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id),
    check_type TEXT NOT NULL, result JSONB DEFAULT '{}',
    score NUMERIC DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, job_type TEXT NOT NULL,
    config JSONB DEFAULT '{}', schedule_cron TEXT, schedule_description TEXT,
    dataset_id INTEGER, is_active BOOLEAN DEFAULT true,
    last_run TIMESTAMP, next_run TIMESTAMP,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS job_runs (
    id SERIAL PRIMARY KEY, job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', result JSONB DEFAULT '{}',
    rows_processed INTEGER DEFAULT 0, error_message TEXT,
    started_at TIMESTAMP DEFAULT NOW(), finished_at TIMESTAMP, duration_ms INTEGER DEFAULT 0
  )`);

  await q(`CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY, dataset_id INTEGER, title TEXT NOT NULL,
    template TEXT DEFAULT 'default', content JSONB DEFAULT '{}',
    html_content TEXT DEFAULT '', created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS scenarios (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    dataset_id INTEGER, variables JSONB DEFAULT '[]', assumptions JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}', created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS business_questions (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    dataset_id INTEGER, question TEXT NOT NULL, answer JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS automl_runs (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    dataset_id INTEGER, target_col TEXT NOT NULL, task_type TEXT DEFAULT 'classification',
    feature_cols TEXT[] DEFAULT '{}', results JSONB DEFAULT '{}',
    best_model TEXT, best_score NUMERIC, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS nl_queries (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    dataset_id INTEGER, natural_text TEXT NOT NULL, generated_sql TEXT,
    confidence NUMERIC DEFAULT 0, executed BOOLEAN DEFAULT false,
    result_rows INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS syntax_sessions (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    language TEXT NOT NULL, code TEXT NOT NULL, errors JSONB DEFAULT '[]',
    fixes JSONB DEFAULT '[]', created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    target_type TEXT NOT NULL, target_id TEXT NOT NULL, content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS shares (
    id SERIAL PRIMARY KEY, resource_type TEXT NOT NULL, resource_id INTEGER NOT NULL,
    shared_by INTEGER REFERENCES users(id), shared_with_email TEXT NOT NULL,
    permissions TEXT DEFAULT 'view', created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '', owner_id INTEGER REFERENCES users(id),
    plan TEXT DEFAULT 'free', created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS workspace_members (
    id SERIAL PRIMARY KEY, workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS annotations (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    row_index INTEGER, column_name TEXT, content TEXT NOT NULL,
    annotation_type TEXT DEFAULT 'note', target_type TEXT DEFAULT 'column',
    target_id TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
    details JSONB DEFAULT '{}', ip_address TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, dataset_id INTEGER REFERENCES datasets(id),
    condition_sql TEXT, threshold_value NUMERIC, comparison_operator TEXT DEFAULT '>',
    notification_channel TEXT DEFAULT 'in_app', notification_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true, last_triggered TIMESTAMP,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS alert_triggers (
    id SERIAL PRIMARY KEY, alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
    triggered_at TIMESTAMP DEFAULT NOW(), value NUMERIC, details JSONB DEFAULT '{}'
  )`);

  await q(`CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY, alert_id INTEGER, status TEXT DEFAULT 'sent',
    message TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
    method TEXT DEFAULT 'POST', event_type TEXT DEFAULT 'manual',
    threshold_column TEXT, threshold_value NUMERIC, threshold_operator TEXT,
    is_active BOOLEAN DEFAULT true, dataset_id INTEGER,
    last_triggered TIMESTAMP, trigger_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, key_hash TEXT NOT NULL, key_prefix TEXT NOT NULL,
    scopes TEXT[] DEFAULT '{}', last_used TIMESTAMP,
    request_count INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS integration_credentials (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    service TEXT NOT NULL, credentials JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS connectors (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    config JSONB DEFAULT '{}', status TEXT DEFAULT 'inactive',
    last_tested TIMESTAMP, created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS masking_rules (
    id SERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    column_name TEXT NOT NULL, mask_type TEXT NOT NULL, options JSONB DEFAULT '{}',
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS lineage_nodes (
    id SERIAL PRIMARY KEY, node_id TEXT UNIQUE NOT NULL, node_type TEXT NOT NULL,
    label TEXT NOT NULL, dataset_id INTEGER, metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS lineage_edges (
    id SERIAL PRIMARY KEY, source_node TEXT NOT NULL, target_node TEXT NOT NULL,
    relationship TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS geo_layers (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    lat_col TEXT NOT NULL, lng_col TEXT NOT NULL, value_col TEXT,
    layer_type TEXT DEFAULT 'circle',
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS pivot_configs (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, dataset_id INTEGER,
    row_fields TEXT[] DEFAULT '{}', col_fields TEXT[] DEFAULT '{}',
    value_field TEXT, aggregator TEXT DEFAULT 'sum',
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS tfa_secrets (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    secret TEXT NOT NULL, enabled BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS query_cache (
    id SERIAL PRIMARY KEY, cache_key TEXT UNIQUE NOT NULL, result JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS crm_connections (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    service TEXT NOT NULL, credentials JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active', connected_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS streaming_sources (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    config JSONB DEFAULT '{}', is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS narratives (
    id SERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id), content JSONB DEFAULT '{}',
    generated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS data_profiles (
    id SERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
    profile_data JSONB DEFAULT '{}', generated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS zoho_tokens (
    id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT, refresh_token TEXT NOT NULL,
    api_domain TEXT DEFAULT 'https://www.zohoapis.com',
    expires_at BIGINT, scope TEXT,
    connected_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS benchmark_runs (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    dataset_id INTEGER, target_col TEXT, task_type TEXT,
    results JSONB DEFAULT '{}', total_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS data_contracts (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    description TEXT DEFAULT '',
    dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
    rules JSONB DEFAULT '[]',
    created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    last_validated_at TIMESTAMP, last_score INTEGER,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  console.log('✅ All tables created');
}

async function seedUsers() {
  console.log('\n👤 Seeding users...');
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPass  = process.env.SEED_ADMIN_PASSWORD;
  const analystEmail = process.env.SEED_ANALYST_EMAIL;
  const analystPass  = process.env.SEED_ANALYST_PASSWORD;
  if (!adminEmail || !adminPass || !analystEmail || !analystPass) {
    console.error('❌ Missing required env vars: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ANALYST_EMAIL, SEED_ANALYST_PASSWORD');
    console.error('   Set these secrets before running neon_init.js');
    process.exit(1);
  }
  const h1 = await bcrypt.hash(adminPass, 12);
  const h2 = await bcrypt.hash(analystPass, 12);
  await q(`INSERT INTO users (name,email,password_hash,role,email_verified,avatar_color) VALUES
    ('Admin',$1,$2,'admin',true,'#6366f1'),
    ('Analyst',$3,$4,'analyst',true,'#10b981')
    ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash`, [adminEmail, h1, analystEmail, h2]);
  console.log('✅ Admin and analyst users seeded');
}

async function seedDatasets() {
  console.log('\n📊 Seeding dataset metadata...');
  const datasets = [
    { id:1, name:'Sales Performance 2023', desc:'Monthly sales performance across regions, products, and channels with geo coordinates', rows:500, schema:[{name:'sale_id',type:'integer'},{name:'date',type:'text'},{name:'region',type:'text'},{name:'product',type:'text'},{name:'channel',type:'text'},{name:'quantity',type:'numeric'},{name:'unit_price',type:'numeric'},{name:'discount',type:'numeric'},{name:'revenue',type:'numeric'},{name:'cost',type:'numeric'},{name:'profit',type:'numeric'},{name:'customer_id',type:'numeric'},{name:'lat',type:'numeric'},{name:'lng',type:'numeric'}] },
    { id:2, name:'HR Employee Analytics', desc:'HR employee records including salary, performance scores, and attrition data', rows:300, schema:[{name:'employee_id',type:'text'},{name:'name',type:'text'},{name:'department',type:'text'},{name:'role',type:'text'},{name:'salary',type:'numeric'},{name:'hire_date',type:'text'},{name:'age',type:'numeric'},{name:'gender',type:'text'},{name:'performance_score',type:'numeric'},{name:'attrition',type:'text'},{name:'years_at_company',type:'numeric'},{name:'education',type:'text'},{name:'job_satisfaction',type:'numeric'},{name:'overtime',type:'text'},{name:'monthly_income',type:'numeric'},{name:'distance_from_home',type:'numeric'}] },
    { id:3, name:'Financial Time Series 2023', desc:'Daily OHLCV financial time series with market cap and volume data', rows:365, schema:[{name:'date',type:'text'},{name:'open',type:'numeric'},{name:'high',type:'numeric'},{name:'low',type:'numeric'},{name:'close',type:'numeric'},{name:'volume',type:'numeric'},{name:'market_cap',type:'numeric'},{name:'returns',type:'numeric'}] },
    { id:4, name:'E-Commerce Orders 2023', desc:'E-commerce order data with customer segments, products, and shipping details', rows:1000, schema:[{name:'order_id',type:'text'},{name:'customer_id',type:'text'},{name:'product',type:'text'},{name:'category',type:'text'},{name:'quantity',type:'numeric'},{name:'unit_price',type:'numeric'},{name:'discount',type:'numeric'},{name:'order_value',type:'numeric'},{name:'order_date',type:'text'},{name:'ship_date',type:'text'},{name:'region',type:'text'},{name:'customer_segment',type:'text'},{name:'payment_method',type:'text'},{name:'status',type:'text'},{name:'returns',type:'text'}] },
    { id:5, name:'Marketing Campaigns 2023', desc:'Marketing campaign performance with spend, impressions, conversions, and ROI', rows:1000, schema:[{name:'campaign_id',type:'text'},{name:'campaign_name',type:'text'},{name:'channel',type:'text'},{name:'start_date',type:'text'},{name:'end_date',type:'text'},{name:'budget',type:'numeric'},{name:'spend',type:'numeric'},{name:'impressions',type:'numeric'},{name:'clicks',type:'numeric'},{name:'conversions',type:'numeric'},{name:'revenue',type:'numeric'},{name:'roi',type:'numeric'},{name:'status',type:'text'}] },
    { id:6, name:'IoT Sensor Telemetry 2024', desc:'IoT sensor data with temperature, humidity, pressure, and anomaly flags', rows:1000, schema:[{name:'sensor_id',type:'text'},{name:'timestamp',type:'text'},{name:'temperature',type:'numeric'},{name:'humidity',type:'numeric'},{name:'pressure',type:'numeric'},{name:'vibration',type:'numeric'},{name:'voltage',type:'numeric'},{name:'current',type:'numeric'},{name:'power',type:'numeric'},{name:'location',type:'text'},{name:'device_type',type:'text'},{name:'anomaly',type:'text'}] },
    { id:7, name:'Customer Churn Analytics', desc:'Customer data with usage metrics, plan details, and churn label for ML classification', rows:1000, schema:[{name:'customer_id',type:'text'},{name:'age',type:'numeric'},{name:'gender',type:'text'},{name:'tenure',type:'numeric'},{name:'monthly_charges',type:'numeric'},{name:'total_charges',type:'numeric'},{name:'contract',type:'text'},{name:'payment_method',type:'text'},{name:'internet_service',type:'text'},{name:'tech_support',type:'text'},{name:'online_security',type:'text'},{name:'num_products',type:'numeric'},{name:'satisfaction_score',type:'numeric'},{name:'churned',type:'text'}] },
  ];
  for (const d of datasets) {
    await q(
      `INSERT INTO datasets (id,name,description,row_count,schema,uploaded_by,source) VALUES ($1,$2,$3,$4,$5::jsonb,1,'demo') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`,
      [d.id, d.name, d.desc, d.rows, JSON.stringify(d.schema)]
    );
  }
  // Reset sequence
  await q(`SELECT setval('datasets_id_seq', (SELECT MAX(id) FROM datasets))`);
  console.log('✅ Dataset metadata (7)');
}

async function seedData1() {
  console.log('\n📈 Creating and seeding data_1 (Sales Performance)...');
  await q(`CREATE TABLE IF NOT EXISTS data_1 (row_index SERIAL, sale_id INTEGER, date TEXT, region TEXT, product TEXT, channel TEXT, quantity NUMERIC, unit_price NUMERIC, discount NUMERIC, revenue NUMERIC, cost NUMERIC, profit NUMERIC, customer_id NUMERIC, lat NUMERIC, lng NUMERIC)`);
  const cnt = await q('SELECT COUNT(*) as c FROM data_1');
  if (parseInt(cnt.rows[0].c) > 0) { console.log('  data_1 already has data — skipping'); return; }
  const regions = ['North','South','East','West','Central'];
  const products = ['Laptop Pro','Smart Phone X','Tablet Air','Monitor HD','Headphones BT','Keyboard Mech','Mouse Wireless','Webcam HD','Speaker JBL','Router WiFi6'];
  const channels = ['Online','Retail','Wholesale','Direct'];
  const coords = { North:{lat:44.5,lng:-93.5}, South:{lat:30.3,lng:-90.0}, East:{lat:40.7,lng:-74.0}, West:{lat:37.7,lng:-122.4}, Central:{lat:41.8,lng:-87.6} };
  const start = new Date('2023-01-01');
  const rows = [];
  for (let i = 0; i < 500; i++) {
    const d = new Date(start); d.setDate(d.getDate() + Math.floor(i * 0.73));
    const qty = rnd(1,50), up = rndF(20,800), disc = rndF(0,0.35);
    const rev = parseFloat((qty*up*(1-disc)).toFixed(2)), cost = parseFloat((rev*rndF(0.45,0.75)).toFixed(2));
    const region = regions[i%regions.length], c = coords[region];
    rows.push([i+1, d.toISOString().slice(0,10), region, products[i%products.length], channels[i%channels.length], qty, up, disc, rev, cost, parseFloat((rev-cost).toFixed(2)), rnd(1,200), parseFloat((c.lat+(Math.random()-0.5)*3).toFixed(4)), parseFloat((c.lng+(Math.random()-0.5)*5).toFixed(4))]);
  }
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i+50);
    const vals = batch.map((_,bi) => `(${[...Array(14)].map((_,ci)=>`$${bi*14+ci+1}`).join(',')})`).join(',');
    await q(`INSERT INTO data_1 (sale_id,date,region,product,channel,quantity,unit_price,discount,revenue,cost,profit,customer_id,lat,lng) VALUES ${vals}`, batch.flat());
  }
  console.log('✅ data_1 seeded (500 rows)');
}

async function seedData2() {
  console.log('\n👥 Creating and seeding data_2 (HR Analytics)...');
  await q(`CREATE TABLE IF NOT EXISTS data_2 (row_index SERIAL, employee_id TEXT, name TEXT, department TEXT, role TEXT, salary NUMERIC, hire_date TEXT, age NUMERIC, gender TEXT, performance_score NUMERIC, attrition TEXT, years_at_company NUMERIC, education TEXT, job_satisfaction NUMERIC, overtime TEXT, monthly_income NUMERIC, distance_from_home NUMERIC)`);
  const cnt = await q('SELECT COUNT(*) as c FROM data_2');
  if (parseInt(cnt.rows[0].c) > 0) { console.log('  data_2 already has data — skipping'); return; }
  const depts = ['Engineering','Sales','HR','Finance','Marketing','Operations','IT','Legal'];
  const roles = ['Manager','Senior Analyst','Analyst','Director','Coordinator','Specialist','Associate','Executive'];
  const educs = ['Bachelor','Master','PhD','High School','Associate'];
  const rows = [];
  for (let i = 0; i < 300; i++) {
    const dept = pick(depts), yrs = rnd(1,15);
    rows.push([`E${String(i+1).padStart(4,'0')}`, `Employee ${i+1}`, dept, pick(roles), rnd(40000,150000), `${2024-yrs}-${String(rnd(1,12)).padStart(2,'0')}-${String(rnd(1,28)).padStart(2,'0')}`, rnd(22,65), pick(['Male','Female']), rndF(1,5,1), pick(['Yes','No','No','No','No']), yrs, pick(educs), rnd(1,5), pick(['Yes','No']), rnd(3000,12000), rnd(1,50)]);
  }
  for (let i=0;i<rows.length;i+=50) {
    const batch=rows.slice(i,i+50); const cols=16;
    const vals=batch.map((_,bi)=>`(${[...Array(cols)].map((_,ci)=>`$${bi*cols+ci+1}`).join(',')})`).join(',');
    await q(`INSERT INTO data_2 (employee_id,name,department,role,salary,hire_date,age,gender,performance_score,attrition,years_at_company,education,job_satisfaction,overtime,monthly_income,distance_from_home) VALUES ${vals}`, batch.flat());
  }
  console.log('✅ data_2 seeded (300 rows)');
}

async function seedData3() {
  console.log('\n💹 Creating and seeding data_3 (Financial Time Series)...');
  await q(`CREATE TABLE IF NOT EXISTS data_3 (row_index SERIAL, date TEXT, open NUMERIC, high NUMERIC, low NUMERIC, close NUMERIC, volume NUMERIC, market_cap NUMERIC, returns NUMERIC)`);
  const cnt = await q('SELECT COUNT(*) as c FROM data_3');
  if (parseInt(cnt.rows[0].c) > 0) { console.log('  data_3 already has data — skipping'); return; }
  const rows = []; let price = 150.0;
  for (let i = 0; i < 365; i++) {
    const d = new Date('2023-01-01'); d.setDate(d.getDate()+i);
    const change = (Math.random()-0.48)*4; price = Math.max(80, price+change);
    const open=parseFloat(price.toFixed(2)), h=parseFloat((price+rndF(0,3)).toFixed(2)), l=parseFloat((price-rndF(0,3)).toFixed(2)), close=parseFloat((price+rndF(-1,1)).toFixed(2));
    const vol=rnd(1000000,10000000);
    rows.push([d.toISOString().slice(0,10), open, h, l, close, vol, parseFloat((close*vol/1000).toFixed(0)), parseFloat(((close-open)/open*100).toFixed(4))]);
  }
  for (let i=0;i<rows.length;i+=50) {
    const batch=rows.slice(i,i+50); const cols=8;
    const vals=batch.map((_,bi)=>`(${[...Array(cols)].map((_,ci)=>`$${bi*cols+ci+1}`).join(',')})`).join(',');
    await q(`INSERT INTO data_3 (date,open,high,low,close,volume,market_cap,returns) VALUES ${vals}`, batch.flat());
  }
  console.log('✅ data_3 seeded (365 rows)');
}

async function seedData4() {
  console.log('\n🛒 Creating and seeding data_4 (E-Commerce Orders)...');
  await q(`CREATE TABLE IF NOT EXISTS data_4 (row_index SERIAL, order_id TEXT, customer_id TEXT, product TEXT, category TEXT, quantity NUMERIC, unit_price NUMERIC, discount NUMERIC, order_value NUMERIC, order_date TEXT, ship_date TEXT, region TEXT, customer_segment TEXT, payment_method TEXT, status TEXT, returns TEXT)`);
  const cnt = await q('SELECT COUNT(*) as c FROM data_4');
  if (parseInt(cnt.rows[0].c) > 0) { console.log('  data_4 already has data — skipping'); return; }
  const cats=['Electronics','Clothing','Home & Garden','Sports','Books','Food & Beverage','Beauty','Toys'];
  const prods=['Wireless Earbuds','Running Shoes','Coffee Maker','Yoga Mat','Cookbook','Moisturizer','LEGO Set','Smart Watch','Backpack','Desk Lamp'];
  const segs=['Consumer','Corporate','Home Office','Small Business'];
  const pays=['Credit Card','PayPal','Debit Card','Bank Transfer','Crypto'];
  const regs=['North','South','East','West','Central'];
  const rows=[];
  for (let i=0;i<1000;i++) {
    const qty=rnd(1,10), up=rndF(10,500), disc=rndF(0,0.30), ov=parseFloat((qty*up*(1-disc)).toFixed(2));
    const od=new Date('2023-01-01'); od.setDate(od.getDate()+rnd(0,364));
    const sd=new Date(od); sd.setDate(sd.getDate()+rnd(1,7));
    rows.push([`ORD-${String(i+1).padStart(5,'0')}`, `C${rnd(1000,9999)}`, pick(prods), pick(cats), qty, up, disc, ov, od.toISOString().slice(0,10), sd.toISOString().slice(0,10), pick(regs), pick(segs), pick(pays), pick(['Delivered','Shipped','Processing','Cancelled','Delivered','Delivered']), pick(['No','No','No','Yes'])]);
  }
  for (let i=0;i<rows.length;i+=50) {
    const batch=rows.slice(i,i+50); const cols=15;
    const vals=batch.map((_,bi)=>`(${[...Array(cols)].map((_,ci)=>`$${bi*cols+ci+1}`).join(',')})`).join(',');
    await q(`INSERT INTO data_4 (order_id,customer_id,product,category,quantity,unit_price,discount,order_value,order_date,ship_date,region,customer_segment,payment_method,status,returns) VALUES ${vals}`, batch.flat());
  }
  console.log('✅ data_4 seeded (1000 rows)');
}

async function seedData5() {
  console.log('\n📣 Creating and seeding data_5 (Marketing Campaigns)...');
  await q(`CREATE TABLE IF NOT EXISTS data_5 (row_index SERIAL, campaign_id TEXT, campaign_name TEXT, channel TEXT, start_date TEXT, end_date TEXT, budget NUMERIC, spend NUMERIC, impressions NUMERIC, clicks NUMERIC, conversions NUMERIC, revenue NUMERIC, roi NUMERIC, status TEXT)`);
  const cnt = await q('SELECT COUNT(*) as c FROM data_5');
  if (parseInt(cnt.rows[0].c) > 0) { console.log('  data_5 already has data — skipping'); return; }
  const channels=['Email','Social Media','Search','Display','Video','Influencer','Affiliate','Content'];
  const names=['Spring Sale','Summer Blast','Back to School','Holiday Rush','New Year Deal','Brand Awareness','Product Launch','Retargeting'];
  const rows=[];
  for (let i=0;i<1000;i++) {
    const sd=new Date('2023-01-01'); sd.setDate(sd.getDate()+rnd(0,300));
    const ed=new Date(sd); ed.setDate(ed.getDate()+rnd(7,60));
    const budget=rnd(1000,50000), spend=parseFloat((budget*rndF(0.7,1.0)).toFixed(2));
    const impr=rnd(5000,500000), clicks=Math.floor(impr*rndF(0.01,0.08)), convs=Math.floor(clicks*rndF(0.02,0.15));
    const rev=parseFloat((convs*rndF(20,200)).toFixed(2)), roi=parseFloat(((rev-spend)/spend*100).toFixed(2));
    rows.push([`C${String(i+1).padStart(4,'0')}`, `${pick(names)} ${2023}`, pick(channels), sd.toISOString().slice(0,10), ed.toISOString().slice(0,10), budget, spend, impr, clicks, convs, rev, roi, pick(['Active','Completed','Paused','Completed','Completed'])]);
  }
  for (let i=0;i<rows.length;i+=50) {
    const batch=rows.slice(i,i+50); const cols=13;
    const vals=batch.map((_,bi)=>`(${[...Array(cols)].map((_,ci)=>`$${bi*cols+ci+1}`).join(',')})`).join(',');
    await q(`INSERT INTO data_5 (campaign_id,campaign_name,channel,start_date,end_date,budget,spend,impressions,clicks,conversions,revenue,roi,status) VALUES ${vals}`, batch.flat());
  }
  console.log('✅ data_5 seeded (1000 rows)');
}

async function seedData6() {
  console.log('\n🔧 Creating and seeding data_6 (IoT Telemetry)...');
  await q(`CREATE TABLE IF NOT EXISTS data_6 (row_index SERIAL, sensor_id TEXT, timestamp TEXT, temperature NUMERIC, humidity NUMERIC, pressure NUMERIC, vibration NUMERIC, voltage NUMERIC, current NUMERIC, power NUMERIC, location TEXT, device_type TEXT, anomaly TEXT)`);
  const cnt = await q('SELECT COUNT(*) as c FROM data_6');
  if (parseInt(cnt.rows[0].c) > 0) { console.log('  data_6 already has data — skipping'); return; }
  const locs=['Factory Floor A','Factory Floor B','Warehouse 1','Warehouse 2','Server Room','Roof Station','Lab','Office'];
  const types=['Temperature Sensor','Pressure Gauge','Vibration Monitor','Power Meter','Humidity Sensor'];
  const rows=[];
  for (let i=0;i<1000;i++) {
    const ts=new Date('2024-01-01'); ts.setMinutes(ts.getMinutes()+i*15);
    const temp=rndF(18,95), hum=rndF(20,90), pres=rndF(990,1020), vib=rndF(0,10);
    const volt=rndF(220,240), curr=rndF(1,20), pow=parseFloat((volt*curr).toFixed(2));
    const anom=(temp>85||vib>8)?'Yes':'No';
    rows.push([`SEN-${rnd(100,999)}`, ts.toISOString().replace('T',' ').slice(0,19), temp, hum, pres, vib, volt, curr, pow, pick(locs), pick(types), anom]);
  }
  for (let i=0;i<rows.length;i+=50) {
    const batch=rows.slice(i,i+50); const cols=12;
    const vals=batch.map((_,bi)=>`(${[...Array(cols)].map((_,ci)=>`$${bi*cols+ci+1}`).join(',')})`).join(',');
    await q(`INSERT INTO data_6 (sensor_id,timestamp,temperature,humidity,pressure,vibration,voltage,current,power,location,device_type,anomaly) VALUES ${vals}`, batch.flat());
  }
  console.log('✅ data_6 seeded (1000 rows)');
}

async function seedData7() {
  console.log('\n📉 Creating and seeding data_7 (Customer Churn)...');
  await q(`CREATE TABLE IF NOT EXISTS data_7 (row_index SERIAL, customer_id TEXT, age NUMERIC, gender TEXT, tenure NUMERIC, monthly_charges NUMERIC, total_charges NUMERIC, contract TEXT, payment_method TEXT, internet_service TEXT, tech_support TEXT, online_security TEXT, num_products NUMERIC, satisfaction_score NUMERIC, churned TEXT)`);
  const cnt = await q('SELECT COUNT(*) as c FROM data_7');
  if (parseInt(cnt.rows[0].c) > 0) { console.log('  data_7 already has data — skipping'); return; }
  const contracts=['Month-to-month','One year','Two year'];
  const pays=['Electronic check','Mailed check','Bank transfer','Credit card'];
  const internet=['DSL','Fiber optic','No'];
  const rows=[];
  for (let i=0;i<1000;i++) {
    const tenure=rnd(1,72), mc=rndF(20,120), churned=Math.random()<0.265?'Yes':'No';
    rows.push([`CUS-${String(i+1).padStart(5,'0')}`, rnd(18,75), pick(['Male','Female']), tenure, mc, parseFloat((mc*tenure*rndF(0.85,1.1)).toFixed(2)), pick(contracts), pick(pays), pick(internet), pick(['Yes','No']), pick(['Yes','No']), rnd(1,5), rndF(1,5,1), churned]);
  }
  for (let i=0;i<rows.length;i+=50) {
    const batch=rows.slice(i,i+50); const cols=14;
    const vals=batch.map((_,bi)=>`(${[...Array(cols)].map((_,ci)=>`$${bi*cols+ci+1}`).join(',')})`).join(',');
    await q(`INSERT INTO data_7 (customer_id,age,gender,tenure,monthly_charges,total_charges,contract,payment_method,internet_service,tech_support,online_security,num_products,satisfaction_score,churned) VALUES ${vals}`, batch.flat());
  }
  console.log('✅ data_7 seeded (1000 rows)');
}

async function seedFeatureData() {
  console.log('\n🌱 Seeding feature data (catalog, lineage, audit, pipelines, jobs, etc.)...');

  // Catalog
  const dsMeta=[
    {id:1,tags:['sales','revenue','2023'],desc:'Sales performance data across regions, products, and channels',owner:'Demo Admin',domain:'Sales',sensitivity:'internal'},
    {id:2,tags:['hr','employees','attrition'],desc:'HR employee records including salary, performance, and attrition data',owner:'Jane Analyst',domain:'Human Resources',sensitivity:'restricted'},
    {id:3,tags:['finance','stocks','time-series'],desc:'Daily financial time series with OHLCV data and market cap',owner:'Demo Admin',domain:'Finance',sensitivity:'public'},
    {id:4,tags:['ecommerce','orders','customers'],desc:'E-commerce order data with customer segments and product categories',owner:'Demo Admin',domain:'Sales',sensitivity:'internal'},
    {id:5,tags:['marketing','campaigns','roi'],desc:'Marketing campaign performance with spend, impressions, and conversions',owner:'Jane Analyst',domain:'Marketing',sensitivity:'internal'},
    {id:6,tags:['iot','sensors','telemetry'],desc:'IoT sensor telemetry data with temperature, humidity and anomaly flags',owner:'Demo Admin',domain:'Operations',sensitivity:'internal'},
    {id:7,tags:['churn','classification','ml'],desc:'Customer churn analytics dataset used for ML classification models',owner:'Jane Analyst',domain:'Customer Success',sensitivity:'restricted'},
  ];
  for (const d of dsMeta) {
    await q(`INSERT INTO catalog_entries (dataset_id,tags,description,owner,domain,sensitivity,lineage,custom_metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [d.id,d.tags,d.desc,d.owner,d.domain,d.sensitivity,JSON.stringify(['CRM Export','ERP System']),JSON.stringify({quality_score:Math.floor(70+Math.random()*30)})]).catch(()=>{});
  }
  console.log('  ✅ Catalog entries');

  // Geo layers (use lat/lng columns from data_1)
  await q(`INSERT INTO geo_layers (name,dataset_id,lat_col,lng_col,value_col,layer_type,created_by) VALUES ('Sales by Region',1,'lat','lng','revenue','heatmap',1),('Customer Locations',1,'lat','lng','profit','circle',1),('Revenue Hotspots',1,'lat','lng','quantity','marker',1) ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Geo layers');

  // Lineage
  const nodes=[
    {id:'ds_1',type:'dataset',label:'Sales Performance 2023',dsid:1},{id:'ds_2',type:'dataset',label:'HR Employee Analytics',dsid:2},
    {id:'ds_3',type:'dataset',label:'Financial Time Series',dsid:3},{id:'q_1',type:'query',label:'Revenue by Region Query',dsid:null},
    {id:'q_2',type:'query',label:'Monthly Sales Trend',dsid:null},{id:'r_1',type:'report',label:'Q4 Sales Report',dsid:null},
    {id:'r_2',type:'report',label:'HR Attrition Analysis',dsid:null},{id:'v_1',type:'version',label:'Sales v2 (Cleaned)',dsid:null},
    {id:'rc_1',type:'recipe',label:'Data Cleaning Recipe',dsid:null},
  ];
  for (const n of nodes) {
    await q(`INSERT INTO lineage_nodes (node_id,node_type,label,dataset_id,metadata) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (node_id) DO NOTHING`,
      [n.id,n.type,n.label,n.dsid,JSON.stringify({})]).catch(()=>{});
  }
  const edges=[['ds_1','q_1','queried_by'],['ds_1','q_2','queried_by'],['q_1','r_1','included_in'],['q_2','r_1','included_in'],['ds_2','r_2','included_in'],['ds_1','v_1','versioned_as'],['rc_1','v_1','transformed_by'],['v_1','r_1','included_in']];
  for (const [s,t,r] of edges) await q(`INSERT INTO lineage_edges (source_node,target_node,relationship) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,[s,t,r]).catch(()=>{});
  console.log('  ✅ Lineage nodes + edges');

  // Audit logs
  const actions=[
    {uid:1,action:'login',rt:'auth',det:{ip:'192.168.1.1',browser:'Chrome'}},
    {uid:1,action:'dataset_upload',rt:'dataset',rid:'1',det:{name:'Sales Performance 2023',rows:500}},
    {uid:1,action:'query_execute',rt:'query',rid:'1',det:{sql:'SELECT * FROM data_1 LIMIT 10',rows:10}},
    {uid:2,action:'login',rt:'auth',det:{ip:'10.0.0.5',browser:'Firefox'}},
    {uid:2,action:'report_generate',rt:'report',rid:'1',det:{title:'Q4 Sales Report'}},
    {uid:1,action:'dataset_export',rt:'dataset',rid:'1',det:{format:'csv',rows:500}},
    {uid:1,action:'ml_run',rt:'analytics',rid:'1',det:{model:'regression',target:'revenue'}},
    {uid:1,action:'automl_run',rt:'analytics',rid:'7',det:{model:'Random Forest',target:'churned'}},
    {uid:2,action:'query_execute',rt:'query',rid:'2',det:{sql:'SELECT region, SUM(revenue) FROM data_1 GROUP BY region',rows:5}},
    {uid:1,action:'cleaning_apply',rt:'dataset',rid:'1',det:{operation:'remove_duplicates',removed:3}},
    {uid:1,action:'webhook_trigger',rt:'webhook',rid:'1',det:{url:'https://hooks.example.com',status:200}},
    {uid:2,action:'annotation_create',rt:'annotation',rid:'1',det:{column:'revenue',content:'Outlier detected'}},
    {uid:1,action:'pivot_compute',rt:'analytics',rid:'1',det:{rows:['region'],cols:['channel'],agg:'sum'}},
    {uid:1,action:'workspace_create',rt:'workspace',det:{name:'Analytics Team',plan:'pro'}},
    {uid:1,action:'tfa_setup',rt:'auth',det:{method:'TOTP'}},
  ];
  for (const a of actions) {
    await q(`INSERT INTO audit_logs (user_id,action,resource_type,resource_id,details,ip_address,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()-INTERVAL '${rnd(0,30)} days'-INTERVAL '${rnd(0,23)} hours')`,
      [a.uid,a.action,a.rt,a.rid||null,JSON.stringify(a.det),`192.168.${rnd(1,5)}.${rnd(1,254)}`]).catch(()=>{});
  }
  console.log('  ✅ Audit logs');

  // Connectors
  await q(`INSERT INTO connectors (name,type,config,status,last_tested,created_by) VALUES
    ('Analytics DW','postgresql','{"host":"analytics.company.com","port":5432,"database":"datawarehouse"}'::jsonb,'active',NOW(),1),
    ('Marketing MySQL','mysql','{"host":"mysql.marketing.internal","port":3306,"database":"campaigns"}'::jsonb,'active',NOW(),1)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Connectors');

  // Pipelines
  await q(`INSERT INTO pipelines (name,description,steps,source_config,destination_config,is_active,created_by) VALUES
    ('Sales Data Cleanup','Remove duplicates and fill nulls','[{"operation":"remove_duplicates","parameters":{}},{"operation":"fill_missing","parameters":{"strategy":"mean"}}]'::jsonb,'{"dataset_id":1}'::jsonb,'{"dataset_id":1}'::jsonb,true,1),
    ('HR Normalization','Normalize salary and drop missing depts','[{"operation":"normalize","parameters":{"column":"salary"}},{"operation":"drop_missing_rows","parameters":{"columns":["department"]}}]'::jsonb,'{"dataset_id":2}'::jsonb,'{"dataset_id":2}'::jsonb,true,1)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Pipelines');

  // Jobs
  await q(`INSERT INTO jobs (name,job_type,config,schedule_cron,schedule_description,dataset_id,created_by) VALUES
    ('Daily Sales Profiling','profile','{"checks":["nulls","outliers","duplicates"]}'::jsonb,'0 6 * * *','Every day at 6am',1,1),
    ('Weekly HR Report','sql_query','{"sql":"SELECT department, COUNT(*) FROM data_2 GROUP BY department"}'::jsonb,'0 9 * * 1','Every Monday at 9am',2,1),
    ('Monthly Churn Model','profile','{"model":"classification","target":"churned"}'::jsonb,'0 8 1 * *','First of every month',7,1)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Jobs');

  // Workspaces
  await q(`INSERT INTO workspaces (name,slug,owner_id,plan,description) VALUES ('Analytics Team','analytics-team',1,'pro','Main analytics workspace'),('Finance & Risk','finance-risk',1,'enterprise','Finance analytics workspace') ON CONFLICT DO NOTHING`).catch(()=>{});
  const ws = await q('SELECT id FROM workspaces LIMIT 1');
  if (ws.rows.length) await q(`INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,2,'analyst') ON CONFLICT DO NOTHING`,[ws.rows[0].id]).catch(()=>{});
  console.log('  ✅ Workspaces');

  // Webhooks
  await q(`INSERT INTO webhooks (name,url,method,event_type,threshold_column,threshold_value,threshold_operator,is_active,dataset_id,created_by) VALUES
    ('Revenue Alert','https://hooks.slack.com/demo','POST','threshold','revenue',5000,'>',true,1,1),
    ('Pipeline Complete','https://api.example.com/notify','POST','pipeline_complete',null,null,null,true,null,1)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Webhooks');

  // Scenarios
  await q(`INSERT INTO scenarios (name,description,dataset_id,variables,assumptions,created_by) VALUES
    ('Revenue +15%','Model 15% price increase','1','[{"name":"price_multiplier","value":1.15}]'::jsonb,'{"market_growth":0.05}'::jsonb,1),
    ('Marketing +25%','25% budget increase impact','5','[{"name":"budget_multiplier","value":1.25}]'::jsonb,'{"cpa_improvement":0.15}'::jsonb,1)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Scenarios');

  // Recipes
  await q(`INSERT INTO recipes (name,description,steps,tags,created_by,is_public) VALUES
    ('Standard Cleanup','Remove duplicates, trim whitespace','[{"operation":"remove_duplicates","parameters":{}},{"operation":"trim_strings","parameters":{}}]'::jsonb,'{"cleaning","standard"}',1,true),
    ('ML Prep Normalize','Drop nulls then normalize numeric columns','[{"operation":"drop_missing_rows","parameters":{}},{"operation":"normalize","parameters":{"method":"minmax"}}]'::jsonb,'{"normalization","ml-prep"}',1,true)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Recipes');

  // Comments
  await q(`INSERT INTO comments (user_id,target_type,target_id,content) VALUES
    (1,'dataset','1','Revenue looks lower in Q3. Need to investigate South region.'),
    (2,'dataset','1','This matches supply chain disruption in July per CRM notes.'),
    (1,'dataset','2','Attrition rate in Engineering is 23% vs 12% company average.'),
    (1,'dataset','7','Churn model accuracy at 87% — production-ready.')
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Comments');

  // Annotations
  await q(`INSERT INTO annotations (user_id,dataset_id,column_name,content,annotation_type) VALUES
    (1,1,'revenue','Revenue includes all discounts. Net revenue is ~8% lower.','note'),
    (2,1,'discount','Discounts above 0.3 require VP Sales approval.','business_rule'),
    (1,2,'salary','Salary data is as of hire date — not current compensation.','warning'),
    (1,7,'churned','Churn defined as no activity for 90+ days.','definition')
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Annotations');

  // Masking rules
  await q(`INSERT INTO masking_rules (dataset_id,column_name,mask_type,options,created_by) VALUES
    (2,'name','name','{}',1),(7,'customer_id','partial','{"visible":4}',1)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ Masking rules');

  // NL queries history
  await q(`INSERT INTO nl_queries (user_id,dataset_id,natural_text,generated_sql,confidence) VALUES
    (1,1,'Show total revenue by region','SELECT region, SUM(revenue) AS total FROM data_1 GROUP BY region ORDER BY total DESC',0.92),
    (1,1,'Top 5 products by profit','SELECT product, SUM(profit) AS total_profit FROM data_1 GROUP BY product ORDER BY total_profit DESC LIMIT 5',0.90),
    (2,2,'Average salary by department','SELECT department, AVG(salary) AS avg_salary FROM data_2 GROUP BY department ORDER BY avg_salary DESC',0.88),
    (1,3,'Monthly average closing price','SELECT DATE_TRUNC(''month'', date::date) AS month, AVG(close) FROM data_3 GROUP BY 1 ORDER BY 1',0.82)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ NL query history');

  // SQL query history
  await q(`INSERT INTO queries (user_id,dataset_id,sql_text,result_rows,execution_time_ms) VALUES
    (1,1,'SELECT region, SUM(revenue) as total_revenue FROM data_1 GROUP BY region ORDER BY total_revenue DESC',5,23),
    (1,1,'SELECT product, COUNT(*) as orders, AVG(profit) as avg_profit FROM data_1 GROUP BY product ORDER BY orders DESC',10,18),
    (2,2,'SELECT department, COUNT(*) as headcount, AVG(salary) as avg_salary FROM data_2 GROUP BY department',8,15),
    (1,7,'SELECT churned, COUNT(*) as count, AVG(monthly_charges) as avg_charges FROM data_7 GROUP BY churned',2,12)
    ON CONFLICT DO NOTHING`).catch(()=>{});
  console.log('  ✅ SQL query history');

  console.log('\n✅ All feature data seeded!');
}

async function main() {
  console.log('🚀 DataAnalyst Pro — Neon DB Initialization\n');
  try {
    await createSchema();
    await seedUsers();
    await seedDatasets();
    await seedData1();
    await seedData2();
    await seedData3();
    await seedData4();
    await seedData5();
    await seedData6();
    await seedData7();
    await seedFeatureData();
    console.log('\n🎉 Neon database fully initialized!');
    console.log('   Users seeded from SEED_ADMIN_EMAIL / SEED_ANALYST_EMAIL env vars');
  } catch (e) {
    console.error('❌ Fatal error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main();
