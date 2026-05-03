const express = require('express');
const axios = require('axios');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { Pool: PgPool } = require('pg');
const jwt = require('jsonwebtoken');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// DEMO MODE — realistic sample data per connector type
// ═══════════════════════════════════════════════════════════════════════════
const DEMO_SCHEMAS = {
  mysql: {
    tables: [
      { table: 'orders', columns: [{ name: 'order_id', type: 'int' }, { name: 'customer_id', type: 'int' }, { name: 'status', type: 'varchar' }, { name: 'total_amount', type: 'decimal' }, { name: 'created_at', type: 'datetime' }, { name: 'region', type: 'varchar' }] },
      { table: 'customers', columns: [{ name: 'id', type: 'int' }, { name: 'name', type: 'varchar' }, { name: 'email', type: 'varchar' }, { name: 'country', type: 'varchar' }, { name: 'lifetime_value', type: 'decimal' }, { name: 'joined_at', type: 'datetime' }] },
      { table: 'products', columns: [{ name: 'product_id', type: 'int' }, { name: 'name', type: 'varchar' }, { name: 'category', type: 'varchar' }, { name: 'price', type: 'decimal' }, { name: 'stock_qty', type: 'int' }, { name: 'supplier', type: 'varchar' }] },
      { table: 'order_items', columns: [{ name: 'id', type: 'int' }, { name: 'order_id', type: 'int' }, { name: 'product_id', type: 'int' }, { name: 'quantity', type: 'int' }, { name: 'unit_price', type: 'decimal' }] },
    ]
  },
  postgresql: {
    tables: [
      { table: 'events', columns: [{ name: 'event_id', type: 'uuid' }, { name: 'user_id', type: 'int' }, { name: 'event_type', type: 'text' }, { name: 'page', type: 'text' }, { name: 'session_id', type: 'text' }, { name: 'occurred_at', type: 'timestamptz' }] },
      { table: 'users', columns: [{ name: 'id', type: 'int' }, { name: 'email', type: 'text' }, { name: 'name', type: 'text' }, { name: 'plan', type: 'text' }, { name: 'mrr', type: 'numeric' }, { name: 'created_at', type: 'timestamptz' }] },
      { table: 'sessions', columns: [{ name: 'session_id', type: 'text' }, { name: 'user_id', type: 'int' }, { name: 'source', type: 'text' }, { name: 'duration_s', type: 'int' }, { name: 'pages_viewed', type: 'int' }, { name: 'converted', type: 'boolean' }] },
      { table: 'revenue', columns: [{ name: 'id', type: 'int' }, { name: 'user_id', type: 'int' }, { name: 'amount', type: 'numeric' }, { name: 'currency', type: 'text' }, { name: 'plan', type: 'text' }, { name: 'period_start', type: 'date' }] },
    ]
  },
  bigquery: {
    tables: [
      { table: 'analytics.pageviews', columns: [{ name: 'date', type: 'date' }, { name: 'page_path', type: 'string' }, { name: 'sessions', type: 'integer' }, { name: 'users', type: 'integer' }, { name: 'bounce_rate', type: 'float' }, { name: 'avg_session_duration', type: 'float' }] },
      { table: 'marketing.campaigns', columns: [{ name: 'campaign_id', type: 'string' }, { name: 'name', type: 'string' }, { name: 'channel', type: 'string' }, { name: 'impressions', type: 'integer' }, { name: 'clicks', type: 'integer' }, { name: 'spend', type: 'float' }, { name: 'conversions', type: 'integer' }] },
      { table: 'crm.leads', columns: [{ name: 'lead_id', type: 'string' }, { name: 'source', type: 'string' }, { name: 'stage', type: 'string' }, { name: 'deal_value', type: 'float' }, { name: 'assigned_to', type: 'string' }, { name: 'created_at', type: 'timestamp' }] },
      { table: 'crm.deals', columns: [{ name: 'deal_id', type: 'string' }, { name: 'customer', type: 'string' }, { name: 'amount', type: 'float' }, { name: 'stage', type: 'string' }, { name: 'close_date', type: 'date' }, { name: 'owner', type: 'string' }] },
    ]
  },
  redshift: {
    tables: [
      { table: 'public.fact_sales', columns: [{ name: 'sale_id', type: 'bigint' }, { name: 'date_key', type: 'int' }, { name: 'product_key', type: 'int' }, { name: 'store_key', type: 'int' }, { name: 'revenue', type: 'decimal' }, { name: 'units_sold', type: 'int' }, { name: 'cost', type: 'decimal' }] },
      { table: 'public.dim_product', columns: [{ name: 'product_key', type: 'int' }, { name: 'sku', type: 'varchar' }, { name: 'name', type: 'varchar' }, { name: 'category', type: 'varchar' }, { name: 'brand', type: 'varchar' }, { name: 'list_price', type: 'decimal' }] },
      { table: 'public.dim_store', columns: [{ name: 'store_key', type: 'int' }, { name: 'store_name', type: 'varchar' }, { name: 'city', type: 'varchar' }, { name: 'state', type: 'varchar' }, { name: 'region', type: 'varchar' }] },
      { table: 'public.dim_date', columns: [{ name: 'date_key', type: 'int' }, { name: 'full_date', type: 'date' }, { name: 'year', type: 'int' }, { name: 'quarter', type: 'int' }, { name: 'month', type: 'int' }, { name: 'day_of_week', type: 'varchar' }] },
    ]
  },
  snowflake: {
    tables: [
      { table: 'SALES.TRANSACTIONS', columns: [{ name: 'TRANSACTION_ID', type: 'NUMBER' }, { name: 'CUSTOMER_ID', type: 'NUMBER' }, { name: 'PRODUCT_CODE', type: 'VARCHAR' }, { name: 'AMOUNT', type: 'FLOAT' }, { name: 'DISCOUNT_PCT', type: 'FLOAT' }, { name: 'TRANSACTION_DATE', type: 'DATE' }] },
      { table: 'INVENTORY.STOCK', columns: [{ name: 'SKU', type: 'VARCHAR' }, { name: 'WAREHOUSE', type: 'VARCHAR' }, { name: 'ON_HAND', type: 'NUMBER' }, { name: 'RESERVED', type: 'NUMBER' }, { name: 'REORDER_POINT', type: 'NUMBER' }, { name: 'LAST_UPDATED', type: 'TIMESTAMP_NTZ' }] },
      { table: 'HR.EMPLOYEES', columns: [{ name: 'EMPLOYEE_ID', type: 'NUMBER' }, { name: 'NAME', type: 'VARCHAR' }, { name: 'DEPARTMENT', type: 'VARCHAR' }, { name: 'ROLE', type: 'VARCHAR' }, { name: 'SALARY', type: 'FLOAT' }, { name: 'HIRE_DATE', type: 'DATE' }] },
    ]
  },
  csv_url: {
    tables: [
      { table: 'csv_data', columns: [{ name: 'id', type: 'text' }, { name: 'name', type: 'text' }, { name: 'value', type: 'text' }, { name: 'category', type: 'text' }, { name: 'date', type: 'text' }] },
    ]
  },
};

const DEMO_ROWS = {
  orders: [
    { order_id: 1001, customer_id: 201, status: 'Delivered', total_amount: 249.99, created_at: '2024-01-15 09:23:00', region: 'North' },
    { order_id: 1002, customer_id: 202, status: 'Shipped', total_amount: 89.50, created_at: '2024-01-16 11:05:00', region: 'South' },
    { order_id: 1003, customer_id: 203, status: 'Processing', total_amount: 412.00, created_at: '2024-01-17 14:30:00', region: 'East' },
    { order_id: 1004, customer_id: 201, status: 'Delivered', total_amount: 175.25, created_at: '2024-01-18 08:45:00', region: 'North' },
    { order_id: 1005, customer_id: 204, status: 'Cancelled', total_amount: 64.99, created_at: '2024-01-19 16:12:00', region: 'West' },
  ],
  customers: [
    { id: 201, name: 'Acme Corp', email: 'billing@acme.com', country: 'US', lifetime_value: 12450.00, joined_at: '2022-03-10 00:00:00' },
    { id: 202, name: 'Globex LLC', email: 'orders@globex.com', country: 'UK', lifetime_value: 8900.50, joined_at: '2022-07-22 00:00:00' },
    { id: 203, name: 'Initech Inc', email: 'ap@initech.com', country: 'CA', lifetime_value: 3200.00, joined_at: '2023-01-05 00:00:00' },
    { id: 204, name: 'Umbrella GmbH', email: 'umb@umbrella.de', country: 'DE', lifetime_value: 650.00, joined_at: '2023-11-20 00:00:00' },
  ],
  products: [
    { product_id: 1, name: 'Laptop Pro 15"', category: 'Electronics', price: 1299.99, stock_qty: 45, supplier: 'TechSupply Co' },
    { product_id: 2, name: 'Wireless Keyboard', category: 'Accessories', price: 79.99, stock_qty: 210, supplier: 'PeriphCo' },
    { product_id: 3, name: 'USB-C Hub', category: 'Accessories', price: 49.99, stock_qty: 320, supplier: 'PeriphCo' },
    { product_id: 4, name: 'Monitor 27"', category: 'Electronics', price: 449.99, stock_qty: 28, supplier: 'DisplayTech' },
    { product_id: 5, name: 'Standing Desk', category: 'Furniture', price: 799.00, stock_qty: 15, supplier: 'OfficePro' },
  ],
  order_items: [
    { id: 1, order_id: 1001, product_id: 1, quantity: 1, unit_price: 1299.99 },
    { id: 2, order_id: 1001, product_id: 3, quantity: 2, unit_price: 49.99 },
    { id: 3, order_id: 1002, product_id: 2, quantity: 1, unit_price: 79.99 },
    { id: 4, order_id: 1003, product_id: 4, quantity: 1, unit_price: 449.99 },
  ],
  events: [
    { event_id: 'a1b2c3d4-...', user_id: 11, event_type: 'page_view', page: '/dashboard', session_id: 's001', occurred_at: '2024-01-20T10:00:00Z' },
    { event_id: 'b2c3d4e5-...', user_id: 11, event_type: 'click', page: '/reports', session_id: 's001', occurred_at: '2024-01-20T10:03:22Z' },
    { event_id: 'c3d4e5f6-...', user_id: 12, event_type: 'page_view', page: '/pricing', session_id: 's002', occurred_at: '2024-01-20T10:15:00Z' },
    { event_id: 'd4e5f6g7-...', user_id: 13, event_type: 'signup', page: '/register', session_id: 's003', occurred_at: '2024-01-20T11:00:00Z' },
  ],
  users: [
    { id: 11, email: 'alice@example.com', name: 'Alice Johnson', plan: 'enterprise', mrr: 999.00, created_at: '2023-06-01T00:00:00Z' },
    { id: 12, email: 'bob@example.com', name: 'Bob Smith', plan: 'pro', mrr: 49.00, created_at: '2023-09-15T00:00:00Z' },
    { id: 13, email: 'carol@example.com', name: 'Carol White', plan: 'free', mrr: 0, created_at: '2024-01-20T00:00:00Z' },
  ],
  sessions: [
    { session_id: 's001', user_id: 11, source: 'direct', duration_s: 1240, pages_viewed: 8, converted: false },
    { session_id: 's002', user_id: 12, source: 'google', duration_s: 320, pages_viewed: 3, converted: false },
    { session_id: 's003', user_id: 13, source: 'email', duration_s: 780, pages_viewed: 5, converted: true },
  ],
  revenue: [
    { id: 1, user_id: 11, amount: 999.00, currency: 'USD', plan: 'enterprise', period_start: '2024-01-01' },
    { id: 2, user_id: 12, amount: 49.00, currency: 'USD', plan: 'pro', period_start: '2024-01-01' },
  ],
  'analytics.pageviews': [
    { date: '2024-01-20', page_path: '/home', sessions: 4521, users: 3812, bounce_rate: 0.42, avg_session_duration: 145.3 },
    { date: '2024-01-20', page_path: '/pricing', sessions: 1832, users: 1654, bounce_rate: 0.28, avg_session_duration: 212.1 },
    { date: '2024-01-20', page_path: '/blog', sessions: 2901, users: 2754, bounce_rate: 0.61, avg_session_duration: 88.5 },
    { date: '2024-01-20', page_path: '/dashboard', sessions: 891, users: 743, bounce_rate: 0.11, avg_session_duration: 521.0 },
  ],
  'marketing.campaigns': [
    { campaign_id: 'CMP001', name: 'Q1 Brand Awareness', channel: 'Google', impressions: 1200000, clicks: 24000, spend: 8500.00, conversions: 340 },
    { campaign_id: 'CMP002', name: 'Retargeting Feb', channel: 'Meta', impressions: 540000, clicks: 18200, spend: 4200.00, conversions: 210 },
    { campaign_id: 'CMP003', name: 'LinkedIn B2B', channel: 'LinkedIn', impressions: 89000, clicks: 2100, spend: 3100.00, conversions: 45 },
  ],
  'crm.leads': [
    { lead_id: 'L001', source: 'Inbound', stage: 'Qualified', deal_value: 12000, assigned_to: 'Sarah K', created_at: '2024-01-18T09:00:00Z' },
    { lead_id: 'L002', source: 'Outbound', stage: 'Demo', deal_value: 48000, assigned_to: 'Mike T', created_at: '2024-01-19T11:30:00Z' },
    { lead_id: 'L003', source: 'Partner', stage: 'Proposal', deal_value: 95000, assigned_to: 'Lisa M', created_at: '2024-01-20T14:00:00Z' },
  ],
  'crm.deals': [
    { deal_id: 'D001', customer: 'Acme Corp', amount: 48000, stage: 'Closed Won', close_date: '2024-01-15', owner: 'Sarah K' },
    { deal_id: 'D002', customer: 'Globex LLC', amount: 24000, stage: 'Negotiation', close_date: '2024-02-01', owner: 'Mike T' },
  ],
  'public.fact_sales': [
    { sale_id: 100001, date_key: 20240120, product_key: 1, store_key: 5, revenue: 1299.99, units_sold: 1, cost: 820.00 },
    { sale_id: 100002, date_key: 20240120, product_key: 2, store_key: 5, revenue: 159.98, units_sold: 2, cost: 60.00 },
    { sale_id: 100003, date_key: 20240119, product_key: 4, store_key: 3, revenue: 449.99, units_sold: 1, cost: 290.00 },
    { sale_id: 100004, date_key: 20240119, product_key: 5, store_key: 1, revenue: 799.00, units_sold: 1, cost: 480.00 },
  ],
  'public.dim_product': [
    { product_key: 1, sku: 'LPRO15', name: 'Laptop Pro 15"', category: 'Electronics', brand: 'TechPro', list_price: 1299.99 },
    { product_key: 2, sku: 'WKBD01', name: 'Wireless Keyboard', category: 'Accessories', brand: 'PeriphCo', list_price: 79.99 },
    { product_key: 4, sku: 'MON27K', name: 'Monitor 27"', category: 'Electronics', brand: 'DisplayTech', list_price: 449.99 },
    { product_key: 5, sku: 'SDESK1', name: 'Standing Desk', category: 'Furniture', brand: 'OfficePro', list_price: 799.00 },
  ],
  'public.dim_store': [
    { store_key: 1, store_name: 'HQ Flagship', city: 'New York', state: 'NY', region: 'Northeast' },
    { store_key: 3, store_name: 'West LA', city: 'Los Angeles', state: 'CA', region: 'West' },
    { store_key: 5, store_name: 'Chicago Loop', city: 'Chicago', state: 'IL', region: 'Midwest' },
  ],
  'public.dim_date': [
    { date_key: 20240120, full_date: '2024-01-20', year: 2024, quarter: 1, month: 1, day_of_week: 'Saturday' },
    { date_key: 20240119, full_date: '2024-01-19', year: 2024, quarter: 1, month: 1, day_of_week: 'Friday' },
    { date_key: 20240118, full_date: '2024-01-18', year: 2024, quarter: 1, month: 1, day_of_week: 'Thursday' },
  ],
  'SALES.TRANSACTIONS': [
    { TRANSACTION_ID: 10001, CUSTOMER_ID: 501, PRODUCT_CODE: 'LPRO15', AMOUNT: 1299.99, DISCOUNT_PCT: 0.05, TRANSACTION_DATE: '2024-01-20' },
    { TRANSACTION_ID: 10002, CUSTOMER_ID: 502, PRODUCT_CODE: 'WKBD01', AMOUNT: 79.99, DISCOUNT_PCT: 0.0, TRANSACTION_DATE: '2024-01-20' },
    { TRANSACTION_ID: 10003, CUSTOMER_ID: 501, PRODUCT_CODE: 'MON27K', AMOUNT: 449.99, DISCOUNT_PCT: 0.1, TRANSACTION_DATE: '2024-01-19' },
  ],
  'INVENTORY.STOCK': [
    { SKU: 'LPRO15', WAREHOUSE: 'NYC-01', ON_HAND: 45, RESERVED: 8, REORDER_POINT: 20, LAST_UPDATED: '2024-01-20T08:00:00' },
    { SKU: 'WKBD01', WAREHOUSE: 'NYC-01', ON_HAND: 210, RESERVED: 15, REORDER_POINT: 50, LAST_UPDATED: '2024-01-20T08:00:00' },
    { SKU: 'MON27K', WAREHOUSE: 'LA-02', ON_HAND: 28, RESERVED: 3, REORDER_POINT: 15, LAST_UPDATED: '2024-01-20T08:00:00' },
  ],
  'HR.EMPLOYEES': [
    { EMPLOYEE_ID: 1001, NAME: 'Alice Johnson', DEPARTMENT: 'Engineering', ROLE: 'Senior Engineer', SALARY: 145000, HIRE_DATE: '2021-03-15' },
    { EMPLOYEE_ID: 1002, NAME: 'Bob Smith', DEPARTMENT: 'Sales', ROLE: 'Account Executive', SALARY: 92000, HIRE_DATE: '2022-07-01' },
    { EMPLOYEE_ID: 1003, NAME: 'Carol White', DEPARTMENT: 'Marketing', ROLE: 'Growth Manager', SALARY: 108000, HIRE_DATE: '2020-11-20' },
  ],
  csv_data: [
    { id: '1', name: 'Widget A', value: '250.00', category: 'Electronics', date: '2024-01-15' },
    { id: '2', name: 'Widget B', value: '85.50', category: 'Accessories', date: '2024-01-16' },
    { id: '3', name: 'Widget C', value: '430.00', category: 'Electronics', date: '2024-01-17' },
  ],
};

const demoQuery = (type, sql) => {
  // Extract table name from SQL (best-effort)
  const clean = sql.replace(/\s+/g, ' ').trim();
  const tableMatch = clean.match(/FROM\s+["`]?(\S+?)["`]?(?:\s|$|WHERE|LIMIT|ORDER|GROUP)/i);
  const tableName = tableMatch ? tableMatch[1] : null;
  const schema = DEMO_SCHEMAS[type] || DEMO_SCHEMAS.mysql;

  // Try exact table name match first, then case-insensitive
  if (tableName) {
    const rows = DEMO_ROWS[tableName] || DEMO_ROWS[tableName.toLowerCase()] || DEMO_ROWS[tableName.toUpperCase()];
    if (rows) {
      const limitMatch = clean.match(/LIMIT\s+(\d+)/i);
      const limit = limitMatch ? parseInt(limitMatch[1]) : 100;
      return rows.slice(0, limit);
    }
    // Table exists in schema but no canned data — generate placeholder
    const tbl = schema.tables.find(t => t.table.toLowerCase() === tableName.toLowerCase());
    if (tbl) {
      return Array.from({ length: 3 }, (_, i) => {
        const row = {};
        tbl.columns.forEach(c => { row[c.name] = c.type.includes('int') || c.type.includes('NUM') || c.type.includes('FLOAT') ? (i + 1) * 10 : `sample_${c.name}_${i + 1}`; });
        return row;
      });
    }
  }

  // Fallback: return first table's data
  const firstTableName = schema.tables[0]?.table;
  return DEMO_ROWS[firstTableName] || [];
};

// ═══════════════════════════════════════════════════════════════════════════
// Real connection test
// ═══════════════════════════════════════════════════════════════════════════
const getBigQueryToken = async (keyFileContent) => {
  if (!keyFileContent) throw new Error('BigQuery service account key is required — paste the full JSON key file content');
  let creds;
  try { creds = typeof keyFileContent === 'string' ? JSON.parse(keyFileContent) : keyFileContent; }
  catch { throw new Error('Invalid BigQuery key file — content is not valid JSON'); }
  if (!creds?.client_email) throw new Error('BigQuery key file missing "client_email"');
  if (!creds?.private_key) throw new Error('BigQuery key file missing "private_key"');
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: creds.client_email, sub: creds.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/bigquery' };
  const token = jwt.sign(payload, creds.private_key, { algorithm: 'RS256' });
  const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: token }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });
  return r.data.access_token;
};

const testConnection = async (type, config) => {
  if (config.demo) return { ok: true, version: `Demo mode — sample ${type} data · 4 tables available`, demo: true };

  if (type === 'postgresql' || type === 'postgres') {
    const pg = new PgPool({ connectionString: config.connectionString || `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database}`, ssl: config.ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 5000 });
    try { const r = await pg.query('SELECT version()'); await pg.end(); return { ok: true, version: r.rows[0].version }; }
    catch (e) { await pg.end().catch(() => {}); return { ok: false, error: e.message }; }
  }
  if (type === 'mysql') {
    try {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({ host: config.host, port: config.port || 3306, user: config.user, password: config.password, database: config.database, connectTimeout: 5000 });
      const [rows] = await conn.execute('SELECT VERSION() as v');
      await conn.end();
      return { ok: true, version: rows[0].v };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  if (type === 'redshift') {
    const pg = new PgPool({ host: config.host, port: config.port || 5439, database: config.database, user: config.user, password: config.password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { const r = await pg.query('SELECT version()'); await pg.end(); return { ok: true, version: r.rows[0].version }; }
    catch (e) { await pg.end().catch(() => {}); return { ok: false, error: e.message }; }
  }
  if (type === 'bigquery') {
    try {
      const token = await getBigQueryToken(config.keyFileContent);
      const r = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${config.projectId}/datasets`, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
      const datasets = (r.data.datasets || []).map(d => d.datasetReference.datasetId);
      return { ok: true, version: `BigQuery · ${datasets.length} dataset(s): ${datasets.slice(0, 3).join(', ')}` };
    } catch (e) { return { ok: false, error: e.response?.data?.error?.message || e.message }; }
  }
  if (type === 'snowflake') return { ok: false, error: 'Snowflake requires a driver not available in this environment. Enable Demo Mode to explore sample Snowflake data.' };
  if (type === 'csv_url') {
    try { const r = await axios.head(config.url, { timeout: 5000 }); return { ok: true, version: `HTTP ${r.status} · ${r.headers['content-type']}` }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  return { ok: false, error: `Unsupported connector type: ${type}` };
};

const queryConnector = async (connector, sql) => {
  const config = connector.config;
  const type = connector.type;

  if (config.demo) return demoQuery(type, sql);

  const clean = sql.trim().toUpperCase();
  if (!clean.startsWith('SELECT') && !clean.startsWith('WITH') && !clean.startsWith('SHOW') && !clean.startsWith('DESCRIBE'))
    throw new Error('Only SELECT / WITH / SHOW / DESCRIBE queries allowed on external connectors');

  if (type === 'postgresql' || type === 'postgres') {
    const pg = new PgPool({ connectionString: config.connectionString || `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database}`, ssl: config.ssl ? { rejectUnauthorized: false } : false });
    try { const r = await pg.query(sql); await pg.end(); return r.rows; }
    catch (e) { await pg.end().catch(() => {}); throw e; }
  }
  if (type === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({ host: config.host, port: config.port || 3306, user: config.user, password: config.password, database: config.database });
    const [rows] = await conn.execute(sql);
    await conn.end();
    return rows;
  }
  if (type === 'redshift') {
    const pg = new PgPool({ host: config.host, port: config.port || 5439, database: config.database, user: config.user, password: config.password, ssl: { rejectUnauthorized: false } });
    try { const r = await pg.query(sql); await pg.end(); return r.rows; }
    catch (e) { await pg.end().catch(() => {}); throw e; }
  }
  if (type === 'bigquery') {
    const token = await getBigQueryToken(config.keyFileContent);
    const body = { query: sql, useLegacySql: false, timeoutMs: 30000 };
    if (config.defaultDataset) body.defaultDataset = { projectId: config.projectId, datasetId: config.defaultDataset };
    const r = await axios.post(`https://bigquery.googleapis.com/bigquery/v2/projects/${config.projectId}/queries`, body, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 35000 });
    const fields = r.data.schema?.fields || [];
    return (r.data.rows || []).map(row => { const obj = {}; fields.forEach((f, i) => { obj[f.name] = row.f[i]?.v; }); return obj; });
  }
  if (type === 'csv_url') {
    const r = await axios.get(config.url, { timeout: 15000, responseType: 'text' });
    const csvParser = require('csv-parser');
    const { Readable } = require('stream');
    const rows = [];
    await new Promise((resolve, reject) => { Readable.from([r.data]).pipe(csvParser()).on('data', d => rows.push(d)).on('end', resolve).on('error', reject); });
    return rows;
  }
  throw new Error('Unsupported connector type');
};

// ═══════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════
router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, type, status, last_tested, created_at, created_by, (config->>\'demo\')::boolean AS demo_mode FROM connectors ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, type, config } = req.body;
    if (!name || !type || !config) return res.status(400).json({ error: 'name, type, and config are required' });
    const testResult = await testConnection(type, config);
    const status = testResult.ok ? 'active' : 'error';
    const safeConfig = { ...config };
    if (safeConfig.password) safeConfig.password = '***stored***';
    const r = await pool.query(
      'INSERT INTO connectors (name, type, config, status, last_tested, created_by) VALUES ($1,$2,$3,$4,NOW(),$5) RETURNING id, name, type, status, last_tested',
      [name, type, JSON.stringify(config), status, req.user.id]
    );
    res.status(201).json({ ...r.rows[0], demo_mode: !!config.demo, testResult });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/demo', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM connectors WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const { enable } = req.body; // true = enable demo, false = disable
    const newConfig = { ...(r.rows[0].config || {}), demo: !!enable };
    const newStatus = enable ? 'active' : 'error';
    await pool.query('UPDATE connectors SET config=$1, status=$2, last_tested=NOW() WHERE id=$3', [JSON.stringify(newConfig), newStatus, req.params.id]);
    res.json({ success: true, demo_mode: !!enable });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/test', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM connectors WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const testResult = await testConnection(r.rows[0].type, r.rows[0].config);
    await pool.query('UPDATE connectors SET status=$1, last_tested=NOW() WHERE id=$2', [testResult.ok ? 'active' : 'error', req.params.id]);
    res.json(testResult);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/query', authenticate, async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'sql is required' });
    const r = await pool.query('SELECT * FROM connectors WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const rows = await queryConnector(r.rows[0], sql);
    res.json({ rows, rowCount: rows.length, connector: r.rows[0].name, demo: !!r.rows[0].config?.demo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/schema', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM connectors WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const c = r.rows[0];

    if (c.config?.demo) {
      const schema = DEMO_SCHEMAS[c.type] || DEMO_SCHEMAS.mysql;
      return res.json({ connector: c.name, tables: schema.tables, demo: true });
    }

    let schema = [];
    if (c.type === 'postgresql' || c.type === 'postgres' || c.type === 'redshift') {
      schema = await queryConnector(c, "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position");
    } else if (c.type === 'mysql') {
      schema = await queryConnector(c, `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name, DATA_TYPE as data_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`);
    } else if (c.type === 'bigquery') {
      const token = await getBigQueryToken(c.config.keyFileContent);
      const datasetsRes = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${c.config.projectId}/datasets`, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
      for (const ds of (datasetsRes.data.datasets || []).slice(0, 5)) {
        const dsId = ds.datasetReference.datasetId;
        try {
          const tablesRes = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${c.config.projectId}/datasets/${dsId}/tables`, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
          for (const tbl of (tablesRes.data.tables || []).slice(0, 10)) {
            const tblId = tbl.tableReference.tableId;
            const tblRes = await axios.get(`https://bigquery.googleapis.com/bigquery/v2/projects/${c.config.projectId}/datasets/${dsId}/tables/${tblId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
            (tblRes.data.schema?.fields || []).forEach(f => { schema.push({ table_name: `${dsId}.${tblId}`, column_name: f.name, data_type: f.type.toLowerCase() }); });
          }
        } catch {}
      }
    } else if (c.type === 'csv_url') {
      const rows = await queryConnector(c, 'SELECT *');
      if (rows.length) {
        const tableName = c.config.url.split('/').pop().replace(/\.[^.]+$/, '') || 'csv_data';
        Object.keys(rows[0]).forEach(col => schema.push({ table_name: tableName, column_name: col, data_type: 'text' }));
      }
    }

    res.json({
      connector: c.name,
      tables: [...new Set(schema.map(s => s.table_name))].map(t => ({
        table: t,
        columns: schema.filter(s => s.table_name === t).map(s => ({ name: s.column_name, type: s.data_type }))
      }))
    });
  } catch (err) {
    const connErr = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(err.code) || err.message?.includes('timeout');
    if (connErr) return res.json({ connector: 'Unknown', tables: [], error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM connectors WHERE id=$1 AND created_by=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Connector deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/types', authenticate, (req, res) => {
  res.json([
    { type: 'postgresql', label: 'PostgreSQL', color: '#336791', fields: ['host', 'port', 'database', 'user', 'password'], optional: ['ssl', 'connectionString'], description: 'Connect to any PostgreSQL database' },
    { type: 'mysql', label: 'MySQL / MariaDB', color: '#f29111', fields: ['host', 'port', 'database', 'user', 'password'], description: 'Connect to MySQL or MariaDB databases' },
    { type: 'redshift', label: 'Amazon Redshift', color: '#8c4fff', fields: ['host', 'port', 'database', 'user', 'password'], description: 'Amazon Redshift data warehouse (port 5439)' },
    { type: 'bigquery', label: 'Google BigQuery', color: '#4285f4', fields: ['projectId', 'keyFileContent'], optional: ['defaultDataset'], description: 'Google BigQuery analytics warehouse' },
    { type: 'csv_url', label: 'Remote CSV URL', color: '#10b981', fields: ['url'], description: 'Fetch and query a CSV file from any URL' },
    { type: 'snowflake', label: 'Snowflake', color: '#29b5e8', fields: ['account', 'warehouse', 'database', 'schema', 'user', 'password'], description: 'Snowflake cloud data platform' },
  ]);
});

module.exports = router;
