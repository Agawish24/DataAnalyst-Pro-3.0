# DataAnalyst Pro — Enterprise v4.0

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

| ID | Name | Rows |
|----|------|------|
| 1 | Sales Dataset | 500 |
| 2 | HR Dataset | 300 |
| 3 | Financial Dataset | 365 |

## Navigation Structure (v4)

| Group | Pages |
|-------|-------|
| Overview | Dashboard |
| Data | Data Import, Data Catalog, Version Control, DB Connectors, Data Masking, Data Lineage |
| Processing | Data Cleaning, Profiling, Recipes, Pipelines |
| Analysis | EDA, Visualization, SQL Editor, NL→SQL, Syntax Helper, ML Analytics, AutoML, Pivot Table, Geo Maps |
| Intelligence | AI Assistant, Business Questions, Reports, Report Export (PDF), Dashboard Builder |
| Advanced Analytics | Scenario Modeling, Prescriptive Analytics, Annotations |
| Collaboration & Ops | Comments & Sharing, Workspaces, Webhooks & Alerts, Jobs & Alerts |
| Developer | External API, 2FA Security |
| Admin | Audit Logs (admin only) |

## Enterprise Feature Modules (v4 new)

### Syntax Helper (`/syntax-helper`)
- Real-time error detection for SQL, Python, and R code
- Per-language rule engine: missing semicolons, unclosed parens, keyword typos, indentation errors, undefined variables
- Auto-fix suggestions with one-click apply
- Code templates per language (6+ per language)
- Analysis history saved to `syntax_sessions` table
- Keyboard shortcut: Ctrl+Enter to analyze, Tab for indent

### Natural Language to SQL (`/nl-query`)
- Pattern-matching NL engine: aggregation keywords, GROUP BY, ORDER BY, LIMIT detection
- Confidence scoring (0-100%)
- Dataset-aware column suggestions
- Example query library by category (aggregation, filtering, ranking, time-series)
- Run generated SQL directly against active dataset
- Query history saved to `nl_queries` table

### Database Connectors (`/connectors`)
- Connect external PostgreSQL and MySQL databases
- Connection test on create + manual re-test
- Schema browser: list tables and columns
- Run arbitrary SQL against external connections
- Status tracked in `connectors` table

### Workspaces (`/workspaces`)
- Multi-tenant org management: create named workspaces with free/pro/enterprise plans
- Auto-generated URL slug
- Invite members with roles (member / analyst / admin)
- Remove members
- Member list with owner crown indicator
- Data stored in `workspaces` + `workspace_members` tables

### Data Masking (`/masking`)
- 9 mask types: email, phone, credit_card, name, partial, hash, redact, nullify, range
- Column-level PII masking rules per dataset
- Side-by-side original vs masked preview (8 rows, 5 columns)
- Rules stored in `masking_rules` table

### Webhooks & Alerts (`/webhooks`)
- HTTP webhooks (POST/GET/PUT) with optional threshold triggers
- Threshold operator support: `>`, `<`, `>=`, `<=`, `=`
- Manual trigger + test endpoint
- Active/paused toggle
- Full trigger history with status + triggered value
- Stored in `webhooks` + `alert_history` tables

### Data Lineage (`/lineage`)
- SVG graph visualization with 5 node types: dataset, query, report, version, recipe
- Edge labels: queried_by, included_in, versioned_as, evolved_to, transformed_by
- Node detail panel: connections, type, created date
- Column-level lineage table: origin + transformation chain
- Stored in `lineage_nodes` + `lineage_edges` tables

### Geospatial Maps (`/geo`)
- Leaflet-based interactive dark-theme maps (CartoDB dark tiles)
- Layer management: name, lat/lng/value columns, layer type
- Heat-intensity colored circle markers, value-based radius scaling
- Graceful fallback to coordinate table if Leaflet unavailable
- GeoJSON generation from dataset lat/lng columns
- Layers stored in `geo_layers` table

### Pivot Table (`/pivot`)
- Row + column field multi-selection (any dataset columns)
- 8 aggregators: sum, avg, count, count_distinct, min, max, median, stddev
- Heatmap colorization (opacity-scaled by value intensity)
- Row totals, column totals, grand total
- Save/load named pivot configurations
- Configs stored in `pivot_configs` table

### AutoML (`/automl`)
- Automatic model comparison: Random Forest, Gradient Boosting, Logistic Regression, SVM (classification) or Ridge/Lasso regression
- 5-fold cross-validation scoring via Python service
- Best model banner with metric score
- Feature importance bar chart (top 10 features)
- Progress bars per model with color-coded performance
- Run history stored in `automl_runs` table

### Two-Factor Authentication (`/2fa`)
- TOTP-based 2FA using `otplib` (RFC 6238 compliant)
- QR code generation via `qrcode` package
- Manual secret entry fallback
- 6-digit code verification
- Enable/disable with confirmation
- Secrets stored in `tfa_secrets` table

### Report Export (`/pdf-export`)
- HTML report generation with styled layout
- KPI summary: row count, column count, missing values
- AI narrative section (if AI insights available)
- Numeric statistics: mean, median, std dev, min, max per column
- Categorical summaries: unique count, top values
- Report history saved to `reports` table

### Annotations (`/annotations`)
- 5 target types: column, row, chart, dataset, metric
- Add, edit (inline), delete annotations
- Grouped display by type with color-coded badges
- Author attribution + creation date
- Filter by target type
- Stored in `annotations` table

## Full API Route List

### v1 (original)
`/api/auth`, `/api/datasets`, `/api/cleaning`, `/api/queries`, `/api/dashboards`, `/api/ai`, `/api/analytics`, `/api/export`

### v2
`/api/profiling`, `/api/versions`, `/api/recipes`, `/api/catalog`, `/api/collaboration`, `/api/jobs`, `/api/reports`, `/api/audit`, `/api/pipelines`

### v3
`/api/scenarios`, `/api/business-questions`, `/api/external-api`

### v4 Enterprise (new)
`/api/syntax-helper`, `/api/nl-to-sql`, `/api/connectors`, `/api/workspaces`, `/api/masking`, `/api/webhooks`, `/api/lineage`, `/api/annotations`, `/api/automl`, `/api/geo`, `/api/pivot`, `/api/tfa`, `/api/pdf`

## Python Service Endpoints

| Endpoint | Description |
|----------|-------------|
| POST `/analytics/regression` | Linear + polynomial regression |
| POST `/analytics/clustering` | K-means clustering |
| POST `/analytics/classification` | Random Forest + ensemble classification |
| POST `/analytics/outliers` | IQR + Z-score outlier detection |
| POST `/analytics/forecast` | Time-series forecasting |
| POST `/monte-carlo` | Monte Carlo simulation (up to 50k iterations) |
| POST `/prophet-forecast` | Facebook Prophet forecasting |
| POST `/prescriptive` | RandomForest optimization recommendations |
| POST `/root-cause` | Statistical root cause analysis |
| POST `/automl` | AutoML: 4-model comparison with cross-val scoring + feature importance |

## Database Tables

### Core (v1)
`users`, `datasets`, `cleaning_jobs`, `query_history`, `dashboards`, `ai_conversations`, `export_jobs`

### v2
`data_versions`, `recipes`, `catalog_entries`, `collaborations`, `scheduled_jobs`, `reports`, `audit_logs`, `pipelines`

### v3
`scenarios`, `business_questions`, `api_keys`, `quality_checks`

### v4 Enterprise (new)
`workspaces`, `workspace_members`, `connectors`, `masking_rules`, `webhooks`, `alert_history`, `lineage_nodes`, `lineage_edges`, `annotations`, `syntax_sessions`, `nl_queries`, `automl_runs`, `geo_layers`, `pivot_configs`, `tfa_secrets`, `query_cache`

## Key Dependencies

### Node.js (server)
`express`, `pg`, `bcryptjs`, `jsonwebtoken`, `helmet`, `cors`, `compression`, `morgan`, `express-rate-limit`, `axios`, `mysql2`, `node-cache`, `otplib`, `qrcode`, `pdfkit`

### Python (python-service)
`flask`, `pandas`, `numpy`, `scikit-learn`, `scipy`, `statsmodels`, `prophet`, `flask-cors`

### React (client)
`react`, `react-router-dom`, `recharts`, `react-hot-toast`, `lucide-react`, `axios`, `leaflet`, `react-leaflet`, `react-pivottable`
