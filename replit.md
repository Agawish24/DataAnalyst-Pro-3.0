# DataAnalyst Pro — Enterprise v5.0

A full-stack enterprise data analytics suite with React+Vite frontend, Node.js/Express backend, PostgreSQL database, and Python Flask ML microservice.

## Architecture

```
/
├── client/          # React + Vite frontend (port 5000)
├── server/          # Node.js + Express API (port 3001)
└── python-service/  # Flask ML microservice (port 8000)
```

## Workflows

- **Start application** — `cd client && npm run dev` — React frontend on port 5000
- **Backend API** — `node server/src/index.js` — Express API on port 3001
- **Python Analytics** — `python3 python-service/app.py` — Flask ML service on port 8000

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| demo@dataanalyst.com | demo123 | admin |
| analyst@dataanalyst.com | analyst123 | analyst |

## Demo Datasets

| ID | Name | Rows | Columns |
|----|------|------|---------|
| 1 | Sales Performance 2023 | 500 | 12 (sale_id, date, region, product, channel, quantity, unit_price, discount, revenue, cost, profit, customer_id) |
| 2 | HR Employee Analytics | 300 | 16 (employee_id, first_name, last_name, age, department, position, level, salary, hire_date, region, performance_score, satisfaction, years_tenure, status, education, date) |
| 3 | Financial Time Series 2023 | 365 | 8 (day_index, date, open, high, low, close, volume, market_cap) |

**Critical**: Dataset schema is always stored as `[{name, type}]` array format in PostgreSQL JSONB. Never object format. All frontend pages handle both formats defensively.

## Navigation Structure (v5)

| Group | Pages |
|-------|-------|
| Overview | Dashboard |
| Data | Data Import, Data Catalog, Version Control, DB Connectors, Data Masking, Data Lineage, Knowledge Graph |
| Processing | Data Cleaning, Profiling, Recipes, Pipelines |
| Analysis | EDA, Visualization, SQL Editor, NL→SQL, Syntax Helper, ML Analytics, AutoML, Pivot Table, Geo Maps |
| Intelligence | AI Assistant, Business Questions, Reports (+ Deep Narrative), Report Export (PDF), Dashboard Builder |
| Streaming & CRM | Live Streaming, CRM Integration |
| Advanced Analytics | Scenario Modeling, Prescriptive Analytics, Annotations |
| Collaboration & Ops | Comments & Sharing, Workspaces, Webhooks & Alerts, Jobs & Alerts |
| Developer | External API, 2FA Security |
| Admin | Audit Logs (admin only) |

---

## Full Feature Modules

### Syntax Helper (`/syntax-helper`)
- Real-time error detection for SQL, Python, and R code
- Per-language rule engine: missing semicolons, unclosed parens, keyword typos, indentation errors, undefined variables
- Auto-fix suggestions with one-click apply
- Code templates per language (6+ per language) — routes: `GET /templates/sql`, `/templates/python`, `/templates/r`
- Analysis history saved to `syntax_sessions` table
- Backend: `POST /api/syntax-helper/analyze`, `GET /api/syntax-helper/history`, `GET /api/syntax-helper/templates/:language`

### Natural Language to SQL (`/nl-query`)
- Pattern-matching NL engine: aggregation keywords, GROUP BY, ORDER BY, LIMIT detection
- Confidence scoring (0-100%)
- Dataset-aware column suggestions
- Example query library by category (aggregation, filtering, ranking, time-series)
- Run generated SQL directly against active dataset
- Backend: `POST /api/nl-to-sql/query` (also `/convert`), `GET /api/nl-to-sql/history`, `GET /api/nl-to-sql/examples`

### Database Connectors (`/connectors`)
- Connect external PostgreSQL and MySQL databases
- Connection test on create + manual re-test
- Schema browser: list tables and columns
- Run arbitrary SQL against external connections
- Backend: `GET /api/connectors`, `POST /api/connectors`, `POST /api/connectors/:id/test`, `POST /api/connectors/:id/query`

### Workspaces (`/workspaces`)
- Multi-tenant org management: create named workspaces with free/pro/enterprise plans
- Auto-generated URL slug
- Invite members with roles (member / analyst / admin)
- Backend: `GET /api/workspaces`, `POST /api/workspaces`, `POST /api/workspaces/:id/members`

### Data Masking (`/masking`)
- 9 mask types: email, phone, credit_card, name, partial, hash, redact, nullify, range
- Column-level PII masking rules per dataset
- Side-by-side original vs masked preview
- Backend: `GET /api/masking/rules` (all rules), `GET /api/masking/types`, `GET /api/masking/:datasetId`, `POST /api/masking/:datasetId`, `POST /api/masking/:datasetId/preview`

### Webhooks & Alerts (`/webhooks`)
- HTTP webhooks (POST/GET/PUT) with optional threshold triggers
- Threshold operator support: `>`, `<`, `>=`, `<=`, `=`
- Manual trigger + test endpoint
- Active/paused toggle
- Backend: `GET /api/webhooks`, `POST /api/webhooks`, `POST /api/webhooks/:id/trigger`

### Data Lineage (`/lineage`)
- SVG graph visualization with 5 node types: dataset, query, report, version, recipe
- Edge labels: queried_by, included_in, versioned_as, evolved_to, transformed_by
- Column-level lineage table
- Backend: `GET /api/lineage/datasets` (summary list), `GET /api/lineage/:datasetId`, `POST /api/lineage/track`, `GET /api/lineage/graph/all`

### Knowledge Graph (`/knowledge-graph`)
- SVG force-directed visualization across all datasets
- Entity detection: time, attribute, region, employee, financial node types
- Cross-dataset join detection
- Backend: `GET /api/knowledge-graph/analyze`

### Geospatial Maps (`/geo`)
- Leaflet-based interactive dark-theme maps (CartoDB dark tiles)
- Layer management: name, lat/lng/value columns, layer type
- Backend: `GET /api/geo`, `POST /api/geo`, `GET /api/geo/:id/data`, `DELETE /api/geo/:id`

### Pivot Table (`/pivot`)
- Row + column field multi-selection (any dataset columns)
- 8 aggregators: sum, avg, count, count_distinct, min, max, median, stddev
- Heatmap colorization (opacity-scaled by value intensity)
- Row totals, column totals, grand total
- Backend: `POST /api/pivot/:datasetId/compute` (expects: `row_fields`, `col_fields`, `value_field`, `aggregator`), `POST /api/pivot/save`, `GET /api/pivot/saved`

### AutoML (`/automl`)
- Automatic model comparison: Random Forest, Gradient Boosting, Logistic/Ridge/Lasso Regression, SVM
- 5-fold cross-validation scoring via Python `/automl` endpoint
- Best model banner with metric score (accuracy or R²)
- Feature importance bar chart
- Backend: `POST /api/automl/:datasetId/run` (expects: `target_col`, `task_type`, `feature_cols`), `GET /api/automl/runs`

### Two-Factor Authentication (`/2fa`)
- TOTP-based 2FA using `otplib` (RFC 6238 compliant)
- QR code generation via `qrcode` package
- Backend: `GET /api/tfa/status`, `POST /api/tfa/setup`, `POST /api/tfa/verify`, `DELETE /api/tfa/disable`

### Report Export (`/pdf-export`)
- HTML report generation with styled layout
- KPI summary, narrative, numeric/categorical stats
- Backend: `GET /api/pdf/templates`, `POST /api/pdf/generate` (expects: `datasetId`, `title`, `template`), `POST /api/pdf/dataset/:datasetId`, `GET /api/pdf/report/:reportId`

### Annotations (`/annotations`)
- 5 target types: column, row, chart, dataset, metric
- Add, edit, delete annotations with author attribution
- Backend: `GET /api/annotations/:datasetId`, `POST /api/annotations/:datasetId`, `PUT /api/annotations/:id`, `DELETE /api/annotations/:id`

### Live Streaming (`/streaming`)
- SSE-based real-time data feeds: sales, stock, IoT, marketing, ecommerce
- Dataset replay mode: stream any dataset row-by-row
- Recharts AreaChart visualization with rolling window
- Backend: `GET /api/streaming/stream?type=` (SSE), `GET /api/streaming/snapshot?type=`, `GET /api/streaming/types`

### Narratives / Deep Analysis (Reports page + `/api/narratives`)
- 6-section AI narrative: executive summary, key metrics, categorical breakdown, distributions, data quality, recommendations
- Template-based with real dataset statistics
- Backend: `POST /api/narratives/:datasetId`, `GET /api/narratives/history`

### CRM Integration (`/crm`)
- HubSpot Private App integration (token-based)
- Salesforce OAuth2 integration
- Backend: `GET /api/crm/hubspot/status`, `POST /api/crm/hubspot/connect`, `GET /api/crm/salesforce/status`, `POST /api/crm/salesforce/connect`

---

## Full API Route Map

### Auth
`POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`

### Datasets
`GET /api/datasets`, `POST /api/datasets` (upload CSV), `GET /api/datasets/:id`, `GET /api/datasets/:id/summary`, `GET /api/datasets/:id/data`, `DELETE /api/datasets/:id`, `POST /api/datasets/google-sheets` (public CSV URL), `GET /api/datasets/:id/export/csv` (chunked)

### Analytics (Python-backed)
`POST /api/analytics/:id/regression`, `POST /api/analytics/:id/clustering`, `POST /api/analytics/:id/classification`, `POST /api/analytics/:id/forecast` (expects `dateCol`/`valueCol`), `GET /api/analytics/:id/outliers`, `POST /api/analytics/:id/prophet` (expects `dateCol`/`valueCol`), `POST /api/analytics/:id/prescriptive`, `POST /api/analytics/:id/root-cause`

### Other Core
`/api/cleaning`, `/api/queries`, `/api/dashboards`, `/api/ai`, `/api/export`, `/api/profiling`, `/api/versions`, `/api/recipes`, `/api/catalog`, `/api/collaboration`, `/api/jobs`, `/api/reports`, `/api/audit`, `/api/pipelines`, `/api/scenarios`, `/api/business-questions`, `/api/external-api`

### Data Sources (Integrations)
`/api/kaggle`, `/api/github`, `/api/tableau`

---

## Python Service Endpoints

| Endpoint | Description |
|----------|-------------|
| POST `/analytics/regression` | Linear + polynomial regression |
| POST `/analytics/clustering` | K-means clustering |
| POST `/analytics/classification` | Random Forest + ensemble classification |
| POST `/analytics/outliers` | IQR + Z-score outlier detection |
| POST `/analytics/forecast` | Time-series forecasting (expects `data`, `value_column`, `date_column`) |
| POST `/monte-carlo` | Monte Carlo simulation (up to 50k iterations) |
| POST `/prophet-forecast` | Facebook Prophet forecasting (expects `rows`, `date_col`, `value_col`) |
| POST `/prescriptive` | RandomForest optimization recommendations (expects `rows`) |
| POST `/root-cause` | Statistical root cause analysis (expects `rows`) |
| POST `/automl` | AutoML: 4-model comparison with cross-val scoring + feature importance |

---

## Database Tables (54 total)

### Core
`users`, `datasets`, `data_1`, `data_2`, `data_3`, `data_profiles`, `queries`, `dashboards`, `ai_conversations`

### Processing
`data_cleaning_jobs`, `dataset_versions`, `recipes`, `recipe_applications`, `catalog_entries`, `pipeline_runs`, `pipelines`, `quality_checks`, `job_runs`, `jobs`

### Analytics & Reports
`reports`, `scenarios`, `business_questions`, `automl_runs`, `nl_queries`, `syntax_sessions`

### Collaboration
`comments`, `shares`, `workspaces`, `workspace_members`, `annotations`

### Operations
`audit_logs`, `alerts`, `alert_triggers`, `alert_history`, `webhooks`, `api_keys`, `integration_credentials`

### Enterprise v4/v5
`connectors`, `masking_rules`, `lineage_nodes`, `lineage_edges`, `geo_layers`, `pivot_configs`, `tfa_secrets`, `query_cache`, `crm_connections`, `streaming_sources`, `narratives`

### Snapshots (version control)
`snapshot_1_v1`, `snapshot_1_v2`, `snapshot_2_v1`, `snapshot_2_v2`, `snapshot_3_v1`, `snapshot_3_v2`

---

## Key Dependencies

### Node.js (server)
`express`, `pg`, `bcryptjs`, `jsonwebtoken`, `helmet`, `cors`, `compression`, `morgan`, `express-rate-limit`, `axios`, `mysql2`, `node-cache`, `otplib`, `qrcode`, `pdfkit`

### Python (python-service)
`flask`, `pandas`, `numpy`, `scikit-learn`, `scipy`, `statsmodels`, `prophet`, `flask-cors`

### React (client)
`react`, `react-router-dom`, `recharts`, `react-hot-toast`, `lucide-react`, `axios`, `leaflet`, `react-leaflet`

---

## Important Notes for Future Development

1. **Schema format**: Always `[{name: string, type: string}]` array. Use `Array.isArray(schema) ? schema.map(c => c.name) : Object.keys(schema)` defensively everywhere.
2. **Auth column**: `datasets.uploaded_by` (not `created_by`)
3. **Analytics param naming**: Forecast expects `value_column`/`date_column` (snake_case). Prophet expects `rows`/`date_col`/`value_col`. The analytics route handles camelCase→snake_case translation.
4. **Route paths**: Pivot uses `POST /api/pivot/:datasetId/compute` with `{row_fields, col_fields, value_field, aggregator}`. Lineage summary uses `GET /api/lineage/datasets`. Masking all-rules uses `GET /api/masking/rules`.
5. **NL-to-SQL**: Both `/query` (accepts `question`+`datasetId`) and `/convert` (accepts `text`+`dataset_id`) work identically.
6. **PDF**: `/pdf/templates` (GET templates list), `/pdf/generate` (POST with `{datasetId,title}`), `/pdf/dataset/:id` (POST legacy), `/pdf/report/:id` (GET by report ID)
