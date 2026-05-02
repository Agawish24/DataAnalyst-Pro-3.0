# DataAnalyst Pro v2

A full-stack enterprise data analyst web application with React frontend, Node.js/Express backend, PostgreSQL database, and a Python Flask microservice for advanced analytics.

## Architecture

```
/
├── client/          # React + Vite frontend (port 5000)
├── server/          # Node.js + Express API (port 3001)
└── python-service/  # Flask ML microservice (port 8000)
```

## Workflows

- **Start application** — `cd client && npm run dev` — serves React frontend on port 5000 (webview)
- **Backend API** — `node server/src/index.js` — Express API on port 3001
- **Python Analytics** — `python3 python-service/app.py` — Flask ML service on port 8000

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| demo@dataanalyst.com | demo123 | admin |
| analyst@dataanalyst.com | analyst123 | analyst |

## Full Feature Set (v2)

### Data Layer
- **Data Import** — CSV, Excel, JSON upload (50MB), drag-and-drop, instant preview
- **Data Catalog** — Searchable library with tags, domains, sensitivity labels, lineage tracking
- **Version Control** — Snapshot current state, rollback to previous versions, diff comparison

### Processing
- **Data Cleaning** — Remove duplicates, fill missing values, normalize, trim, outlier detection
- **Automated Profiling** — Auto-generated summaries: distributions, correlations, quality scores
- **Transformation Recipes** — Save/share reusable preprocessing templates, apply across datasets
- **Data Pipelines** — ETL workflow builder with source → transform steps → destination dataset

### Analysis
- **EDA** — Full statistical summaries, distribution charts, correlation heatmap
- **Visualization** — Bar, Line, Pie, Doughnut, Scatter, Radar charts (Chart.js), palettes
- **SQL Editor** — Query any dataset with `FROM dataset`, history, Ctrl+Enter, Excel export
- **ML Analytics** — Regression, clustering, classification, forecasting, outlier detection (Python/scikit-learn)

### Intelligence
- **AI Assistant** — Natural language → SQL → visualization (rule-based NL engine)
- **Reports** — Auto-generated reports with AI-written narrative summaries, downloadable
- **Dashboard Builder** — Multi-widget dashboards with stat cards, charts, tables, text

### Collaboration
- **Comments & Annotations** — Threaded comments, column annotations, reply threads, resolve/reopen
- **Sharing** — Grant read/edit/admin access to users by email, per resource
- **Jobs & Alerts** — Schedule recurring analyses (cron), set SQL-based threshold alerts

### Admin (admin role only)
- **Audit Logs** — Complete user activity log, search/filter, export CSV, activity charts
- **Role-Based Access** — Admin, Analyst, Viewer roles with protected routes

### Other
- Multi-language: English / Arabic (RTL layout)
- Export to CSV and Excel
- JWT authentication
- Responsive dark-theme UI

## Database Schema

| Table | Purpose |
|-------|---------|
| users | Auth + roles |
| datasets | Dataset metadata |
| data_{id} | Dynamic per-dataset data tables |
| queries | SQL query history |
| dashboards | Dashboard layouts + widgets |
| ai_conversations | NL→SQL history |
| data_cleaning_jobs | Cleaning operation log |
| data_profiles | Cached profiling results |
| dataset_versions | Version history snapshots |
| snapshot_{id}_v{n} | Dynamic snapshot tables |
| recipes | Saved transformation templates |
| recipe_applications | Recipe usage log |
| catalog_entries | Metadata/tags/lineage per dataset |
| comments | Threaded comments on any resource |
| annotations | Column/row annotations on datasets |
| shares | Resource sharing permissions |
| jobs | Scheduled job configs |
| job_runs | Job execution log |
| alerts | SQL threshold alert configs |
| alert_triggers | Alert firing history |
| reports | Generated reports + AI narrative |
| audit_logs | Full user activity audit trail |
| pipelines | ETL pipeline configs |
| pipeline_runs | Pipeline execution log |

## API Routes (v2 additions)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/profiling/:id | Get/generate data profile |
| GET/POST | /api/versions/:id | List/create dataset versions |
| POST | /api/versions/:id/rollback/:vId | Rollback to version |
| GET | /api/versions/:id/compare/:v1/:v2 | Compare two versions |
| CRUD | /api/recipes | Transformation recipe management |
| POST | /api/recipes/:id/apply/:datasetId | Apply recipe to dataset |
| CRUD | /api/pipelines | ETL pipeline management |
| POST | /api/pipelines/:id/run | Execute pipeline |
| GET | /api/catalog | Search data catalog |
| PUT | /api/catalog/:datasetId | Update catalog entry |
| GET/POST/DELETE | /api/collaboration/comments | Comment management |
| GET/POST/DELETE | /api/collaboration/annotations | Annotation management |
| POST | /api/collaboration/share | Share resource |
| CRUD | /api/jobs | Scheduled job management |
| POST | /api/jobs/:id/run | Run job immediately |
| CRUD | /api/jobs/alerts | Alert management |
| POST | /api/jobs/alerts/check/:id | Check all alerts |
| POST | /api/reports/generate | Generate AI report |
| GET | /api/audit | Audit log (admin only) |
| GET | /api/audit/stats | Audit statistics (admin only) |
