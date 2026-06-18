const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function seed() {
  const users = await pool.query('SELECT id, role FROM users LIMIT 5');
  const adminId = users.rows.find(u => u.role === 'admin')?.id || 1;
  const analystId = users.rows.find(u => u.role === 'analyst')?.id || 2;
  console.log('admin:', adminId, 'analyst:', analystId);

  // Seed dashboards
  const dashConfig1 = JSON.stringify({ layout: [], widgets: [
    { type: 'metric', title: 'Total Revenue', config: { metric: 'revenue', agg: 'sum' } },
    { type: 'chart', title: 'Revenue by Region', config: { type: 'bar', x: 'region', y: 'revenue' } }
  ]});
  const dashConfig2 = JSON.stringify({ layout: [], widgets: [
    { type: 'metric', title: 'Headcount', config: { metric: 'employee_id', agg: 'count' } },
    { type: 'chart', title: 'By Department', config: { type: 'pie', x: 'department', y: 'salary' } }
  ]});
  const dashConfig3 = JSON.stringify({ layout: [], widgets: [
    { type: 'metric', title: 'Total Spend', config: { metric: 'spend', agg: 'sum' } },
    { type: 'chart', title: 'Conversions', config: { type: 'bar', x: 'channel', y: 'conversions' } }
  ]});

  const dashRes = await pool.query(
    `INSERT INTO dashboards (name, description, config, created_by, is_public) VALUES
     ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10), ($11,$12,$13,$14,$15)
     ON CONFLICT DO NOTHING RETURNING id`,
    [
      'Sales Overview', 'Key sales metrics and revenue trends', dashConfig1, adminId, true,
      'HR Analytics Dashboard', 'Employee performance and retention metrics', dashConfig2, adminId, false,
      'Marketing ROI', 'Campaign performance and attribution analysis', dashConfig3, analystId, true
    ]
  );
  console.log('dashboards inserted:', dashRes.rowCount);

  // Seed alerts
  const notifEmail = JSON.stringify({ email: 'admin@company.com', subject: 'Revenue Alert' });
  const notifSlack = JSON.stringify({ webhook: 'https://hooks.slack.com/demo' });
  const notifEmail2 = JSON.stringify({ email: 'analyst@company.com' });
  const notifEmail3 = JSON.stringify({ email: 'admin@company.com' });

  const alertRes = await pool.query(
    `INSERT INTO alerts (name, dataset_id, condition_sql, threshold_value, comparison_operator, notification_channel, notification_config, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9), ($10,$11,$12,$13,$14,$15,$16,$17,$18),
            ($19,$20,$21,$22,$23,$24,$25,$26,$27), ($28,$29,$30,$31,$32,$33,$34,$35,$36)
     ON CONFLICT DO NOTHING RETURNING id`,
    [
      'Revenue Drop Alert', 1, 'SELECT AVG(revenue) FROM data_1', 5000, '<', 'email', notifEmail, true, adminId,
      'High Discount Warning', 1, 'SELECT AVG(discount) FROM data_1', 0.25, '>', 'slack', notifSlack, true, adminId,
      'Low Profit Margin', 1, 'SELECT MIN(profit) FROM data_1', 0, '<', 'email', notifEmail2, true, analystId,
      'Churn Rate Spike', 7, 'SELECT COUNT(*) FROM data_7 WHERE churned=true', 200, '>', 'email', notifEmail3, false, adminId
    ]
  );
  console.log('alerts inserted:', alertRes.rowCount);

  // Seed dataset_versions (using existing snapshot tables)
  const verRes = await pool.query(
    `INSERT INTO dataset_versions (dataset_id, version_number, snapshot_table, change_summary, row_count, created_by)
     VALUES ($1,$2,$3,$4,$5,$6), ($7,$8,$9,$10,$11,$12),
            ($13,$14,$15,$16,$17,$18), ($19,$20,$21,$22,$23,$24),
            ($25,$26,$27,$28,$29,$30), ($31,$32,$33,$34,$35,$36)
     ON CONFLICT DO NOTHING RETURNING id`,
    [
      1, 1, 'snapshot_1_v1', 'Initial import of Sales Performance 2023 data', 500, adminId,
      1, 2, 'snapshot_1_v2', 'Cleaned 3 duplicate rows, standardised region names', 497, adminId,
      2, 1, 'snapshot_2_v1', 'Initial import of HR Employee Analytics', 300, adminId,
      2, 2, 'snapshot_2_v2', 'Added department normalisation, fixed null salary rows', 300, analystId,
      3, 1, 'snapshot_3_v1', 'Initial Financial Time Series 2023 import', 365, adminId,
      3, 2, 'snapshot_3_v2', 'Fixed date parsing, removed 3 outlier trading days', 362, analystId
    ]
  );
  console.log('versions inserted:', verRes.rowCount);

  // Seed reports
  const rep1Content = 'Executive Summary: Sales Performance 2023 shows strong Q4 growth with 12% YoY revenue increase across all regions. Key driver: West Coast channel outperformed targets by 18%.';
  const rep2Content = 'HR Analytics: Employee retention rate stands at 87%, above industry benchmark of 82%. Engineering and Product teams show highest engagement scores.';
  const rep3Content = 'Financial Report: OHLCV analysis of 365-day trading data shows bullish trend with support at 142.50. Prophet forecast predicts 8.3% appreciation over next 90 days.';

  const repRes = await pool.query(
    `INSERT INTO reports (title, dataset_id, template, content, html_content, created_by)
     VALUES ($1,$2,$3,$4,$5,$6), ($7,$8,$9,$10,$11,$12), ($13,$14,$15,$16,$17,$18)
     ON CONFLICT DO NOTHING RETURNING id`,
    [
      'Sales Performance Q4 2023', 1, 'summary', rep1Content, '<h2>Sales Performance</h2><p>' + rep1Content + '</p>', adminId,
      'HR Retention Analysis', 2, 'detailed', rep2Content, '<h2>HR Analytics</h2><p>' + rep2Content + '</p>', adminId,
      'Financial Time Series Forecast', 3, 'executive', rep3Content, '<h2>Financial Report</h2><p>' + rep3Content + '</p>', analystId
    ]
  );
  console.log('reports inserted:', repRes.rowCount);

  await pool.end();
  console.log('Done.');
}

seed().catch(e => { console.error('SEED ERROR:', e.message); pool.end(); process.exit(1); });
