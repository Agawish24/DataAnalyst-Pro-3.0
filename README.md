# DataAnalyst Pro — Enterprise Analytics Platform

<div align="center">

![Version](https://img.shields.io/badge/version-5.0.0-6366f1?style=for-the-badge)
![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js_Express-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python_Flask-3776AB?style=for-the-badge&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)

**A production-grade, full-stack enterprise data analytics suite covering the entire data lifecycle — from ingestion and cleaning through ML-powered insights, real-time streaming, CRM integration, and compliance governance.**

[Demo Access](#demo-access) · [Architecture](#system-architecture) · [Features](#feature-modules) · [API Reference](#api-reference) · [Tech Stack](#tech-stack)

</div>

---

## What This Is

DataAnalyst Pro consolidates the capabilities of five separate enterprise tools into one unified platform: a data warehouse explorer, a BI/visualization suite, an AutoML workbench, a real-time streaming dashboard, and a governance/compliance layer. It is built from scratch without low-code scaffolding, demonstrating full-stack proficiency across frontend, backend, ML microservices, and database design.

**40+ interactive pages. 52 REST API route groups. 54 PostgreSQL tables. 11 ML/analytics endpoints.**

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
│   React 18 + Vite  ·  40+ Pages  ·  Recharts  ·  Leaflet.js       │
│   JWT Auth  ·  Axios Interceptors  ·  Dark Theme  ·  Port 5000     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTP REST (Axios + JWT Bearer)
┌───────────────────────────▼─────────────────────────────────────────┐
│                        API GATEWAY LAYER                            │
│   Node.js 18 + Express 4  ·  52 Route Groups  ·  JWT Middleware   │
│   Rate Limiting  ·  Helmet Security Headers  ·  CORS  ·  Morgan    │
│   Compression  ·  Role-Based Access Control  ·  Port 3001          │
└───────────────┬─────────────────────────────────┬───────────────────┘
                │ node-postgres (pool)             │ HTTP (Axios)
┌───────────────▼──────────────┐   ┌──────────────▼──────────────────┐
│         PostgreSQL           │   │     Python ML Microservice      │
│   54 Tables  ·  JSONB Meta   │   │   Flask  ·  scikit-learn        │
│   Per-Dataset Data Tables    │   │   Prophet  ·  statsmodels       │
│   Full-Text + JSONB Indexes  │   │   SciPy  ·  10 ML Endpoints     │
│   Connection Pooling         │   │   Port 8000                     │
└──────────────────────────────┘   └─────────────────────────────────┘
```

### Core Design Decisions

| Decision | Rationale |
|----------|-----------|
| SSE over WebSockets | One-directional streaming; no handshake overhead; HTTP/2 compatible; zero infrastructure dependencies |
| Python microservice for ML | scikit-learn, Prophet, and SciPy give production-quality ML; clean service boundary keeps Node.js API lean |
| JSONB schema storage | Runtime column introspection without migrations when new datasets are uploaded |
| Per-dataset `data_N` tables | Full SQL access per dataset; avoids Entity-Attribute-Value anti-pattern; enables arbitrary column schemas |
| Stateless JWT auth | No session store; works across CORS and microservice boundaries; 7-day expiry with refresh |
| Defensive schema handling | Frontend always checks `Array.isArray(schema)` — handles both current array format and any legacy format |

---

## Demo Access

| Role | Email | Password |
|------|-------|----------|
| Admin | `demo@dataanalyst.com` | `demo123` |
| Analyst | `analyst@dataanalyst.com` | `analyst123` |

### Demo Datasets

| # | Dataset | Rows | Columns | Best For |
|---|---------|------|---------|----------|
| 1 | Sales Performance 2023 | 500 | 12 | Revenue forecasting, regression, pivot |
| 2 | HR Employee Analytics | 300 | 16 | Classification, attrition modeling |
| 3 | Financial Time Series 2023 | 365 | 8 | Prophet forecasting, trend analysis |
| 4 | E-Commerce Orders 2023 | **1,000** | 15 | Geo maps, segmentation, pivot tables |
| 5 | Marketing Campaigns 2023 | **1,000** | 13 | ROI analysis, channel attribution, AutoML |
| 6 | IoT Sensor Telemetry 2024 | **1,000** | 12 | Anomaly detection, streaming, outliers |
| 7 | Customer Churn Analytics | **1,000** | 14 | AutoML classification, NL→SQL, lineage |

---

## Feature Modules

### Data Ingestion & Management

**Data Import** (`/import`)
- CSV upload with automatic schema inference and column type detection
- Google Sheets import via public CSV URL with live preview
- CRM-direct import from HubSpot, Salesforce, and Zoho CRM
- Chunked streaming CSV export for arbitrarily large datasets

**Data Catalog** (`/catalog`)
- Searchable dataset registry with tags, descriptions, and quality badges
- Schema browser with column-level type information and cardinality stats
- Lineage preview and data quality score per dataset

**Version Control** (`/versions`)
- Point-in-time dataset snapshots with row-level diff comparison
- Restore to any prior version with full audit trail
- Up to 6 stored snapshots per dataset in dedicated `snapshot_N_vM` tables

**Database Connectors** (`/connectors`)
- Connect external PostgreSQL, MySQL, Redshift, BigQuery, Snowflake, and CSV URL sources
- Live schema browser — list tables, inspect column definitions
- Run arbitrary SQL against external sources and preview results in-app
- Connection health monitoring with manual re-test
- All connectors visible to all users (not owner-restricted); schema fetch handles unreachable hosts gracefully

---

### Data Processing

**Data Cleaning** (`/cleaning`)
- Automated detection of missing values, duplicates, type mismatches, and outliers
- Per-column fill strategies: mean, median, mode, constant, forward-fill, drop
- Before/after row count diff with cleaning job history

**Data Profiling** (`/profiling`)
- Column-level statistics: mean, median, std dev, min, max, P25/P75/P95
- Missing value heatmap and cardinality analysis
- Pearson correlation matrix with color-coded significance
- Composite data quality score (0–100) across completeness, uniqueness, and consistency

**Recipes & Pipelines** (`/recipes`, `/pipelines`)
- Reusable transformation recipes: rename, cast, filter, derive, aggregate
- Multi-step pipeline builder with ordered step execution and rollback
- Pipeline run history with success/failure status, row counts, and duration

---

### Analysis & SQL

**SQL Editor** (`/sql`)
- Full in-browser SQL editor against any imported dataset
- Query history with one-click replay and result pagination
- Results exportable as CSV

**Natural Language → SQL** (`/nl-query`)
- Plain-English query conversion: "Show top 10 customers by revenue last quarter"
- Supports aggregation, filtering, ordering, grouping, time-series
- Confidence score (0–100%) per generated query with column-aware suggestions
- One-click execution of generated SQL against the active dataset

**Syntax Helper** (`/syntax-helper`)
- Real-time static analysis for SQL, Python, and R
- Language-specific rules: semicolons, unclosed brackets, keyword typos, indentation, undefined variables
- Auto-fix suggestions with one-click apply
- 6+ starter templates per language; session history persisted in database

---

### Visualization & Exploration

**Exploratory Data Analysis** (`/eda`)
- Auto-generated charts: histograms, box plots, scatter matrices, bar charts
- Column-pair correlation heatmap with significance overlay

**Visualization Builder** (`/visualization`)
- Drag-and-drop chart builder: line, bar, area, pie, scatter, composed
- Multi-series support with custom color palettes
- Recharts-powered with responsive containers and PNG export

**Pivot Table** (`/pivot`)
- Multi-field row and column selection against any dataset column
- 8 aggregators: sum, avg, count, count_distinct, min, max, median, stddev
- Heatmap colorization scaled by value intensity
- Row totals, column totals, grand total; named config save/load

**Geospatial Maps** (`/geo`)
- Leaflet-based interactive dark-theme maps (CartoDB dark tiles)
- Dynamic layer management: choose lat, lng, and value columns per layer
- Heat-intensity colored circle markers with value-based radius
- Multi-layer overlay support with GeoJSON generation

---

### Machine Learning

**ML Analytics** (`/analytics`)
- Regression: linear + polynomial with R², RMSE, and residual plots
- Clustering: K-means with elbow-method suggestion and silhouette scoring
- Classification: Random Forest ensemble with precision, recall, F1, confusion matrix
- Outlier Detection: IQR + Z-score with per-column anomaly flagging
- Forecasting: time-series decomposition with seasonal trend extraction
- All ML powered by the Python Flask microservice via scikit-learn

**AutoML** (`/automl`)
- Automated model selection across 4–6 algorithms per task
- Classification: Random Forest, Gradient Boosting, Logistic Regression, SVM
- Regression: Ridge, Lasso, Gradient Boosting, Random Forest
- 5-fold cross-validation with best-model banner and metric score
- Feature importance bar chart (top 10); run history per user

**Scenario Modeling + Monte Carlo** (`/scenarios`)
- Interactive what-if sliders with live server-side simulation
- Monte Carlo simulation up to 50,000 iterations via Python microservice
- Histogram with 5th/95th percentile risk zone shading
- Percentile table (P5, P25, P50, P75, P95); named scenario save/load

**Facebook Prophet Forecasting** (`/analytics` → Prophet)
- Time-series forecasting with configurable horizon (7–365 days)
- Seasonality modes: additive and multiplicative
- 80% and 95% confidence interval bands
- Component decomposition: trend, weekly, yearly

**Prescriptive Analytics** (`/prescriptive`)
- RandomForest-powered optimization with constraint-based recommendations
- Action recommendations ranked by predicted impact score

---

### Real-Time Streaming (SSE)

**Live Streaming Dashboard** (`/streaming`)
- Server-Sent Events — zero infrastructure; no Kafka, Redis, or WebSocket server needed
- 5 built-in real-time feeds: Sales, Stock Market, IoT Sensors, Marketing Metrics, E-Commerce
- Dataset replay mode: stream any imported dataset row-by-row at configurable speed
- Rolling-window AreaChart (last 30 data points) with Recharts
- Auto-reconnect with exponential backoff on disconnect

---

### Intelligence & AI

**AI Assistant** (`/ai`)
- Conversational interface for dataset Q&A with dataset-aware context injection
- Conversation history persisted per user in database

**Knowledge Graph** (`/knowledge-graph`)
- SVG force-directed graph of semantic relationships across all datasets
- 10 entity types: time, attribute, region, employee, financial, performance, category, identity, product, customer
- Cross-dataset join detection via shared column name pattern matching
- Node detail panel with edge traversal and relationship metadata

**AI Narratives** (Reports page → Deep Narrative)
- 6-section auto-generated narrative per dataset:
  1. Executive Summary — key findings and data shape
  2. Key Metrics — numeric KPIs with trend indicators
  3. Categorical Breakdown — top values and distribution share
  4. Distributions — histogram summary and normality assessment
  5. Data Quality — missing values, outlier count, completeness score
  6. Recommendations — 3–5 actionable insights derived from statistics
- Narratives saved to database with full retrieval history

**Dashboard Builder** (`/dashboards`)
- Multi-dataset KPI card builder with drag-and-drop layout
- Saved dashboard configurations with shareable links

---

### CRM Integrations

**HubSpot** (`/crm` → HubSpot)
- Private App token auth — no OAuth redirect required
- Browse and preview Contacts, Deals, and Companies with cursor pagination
- One-click import into the platform as a new named dataset
- Required scopes: `crm.objects.contacts.read`, `crm.objects.deals.read`, `crm.objects.companies.read`

**Salesforce** (`/crm` → Salesforce)
- Username + Password + Security Token authentication
- Full SOQL query editor with example library
- Import query results as a dataset; sandbox environment toggle

**Zoho CRM** (`/crm` → Zoho CRM)
- OAuth2 refresh-token flow with automatic token renewal on expiry
- Multi-datacenter: US (`zohoapis.com`), EU, India, Australia
- Browse and import Contacts, Leads, Deals, Accounts
- Handles 10,000+ record accounts via server-side cursor pagination

---

### Data Governance

**Audit Logs** (`/audit` → Activity Log)
- Complete user action log: logins, uploads, queries, exports, deletes
- Filterable by user, action type, and resource type; CSV export
- 30-day activity bar chart and top-users / top-actions breakdown

**Anomaly Detection** (`/audit` → Governance)
- 4 real-time behavioral pattern checks:
  - High-volume activity: >20 events per user per hour
  - Login failure spikes: >5 failures in 30 minutes
  - Excessive exports: >10 data exports per user per day
  - Off-hours access: activity between midnight and 5am
- Severity tiers: `critical` / `warning` / `info`; on-demand rescan

**Compliance Checks** (`/audit` → Governance)
- Automated compliance scoring (0–100%) across 5 dimensions:
  - 2FA adoption rate (SOC2 target: 80%+ of users)
  - PII masking coverage (target: 60%+ of datasets have rules)
  - Audit log retention (GDPR/SOC2 target: 90+ days)
  - API key rotation cadence (target: rotated within 90 days)
  - Data lineage coverage (target: 70%+ of datasets tracked)
- Per-check status (pass / warning / fail) with remediation recommendations

**Data Masking** (`/masking`)
- 9 PII mask types: email, phone, credit card, name, partial, hash, redact, nullify, numeric range
- Column-level rules per dataset; side-by-side original vs masked preview
- Rules persisted in `masking_rules` table and applied at preview time

**Data Lineage** (`/lineage`)
- SVG directed graph: dataset → query → report → version → recipe
- 5 edge label types: queried_by, included_in, versioned_as, evolved_to, transformed_by
- Column-level lineage table with origin and transformation chain

---

### Collaboration & Operations

**Multi-Tenant Workspaces** (`/workspaces`)
- Logical workspace isolation per organization (Free / Pro / Enterprise plans)
- Auto-generated URL slug; member invitation with roles: member / analyst / admin

**Annotations** (`/annotations`)
- 5 target types: column, row, chart, dataset, metric
- Inline edit/delete with author attribution and creation timestamp
- Filter by target type; grouped display with color-coded badges

**Webhooks & Alerts** (`/webhooks`)
- HTTP webhooks with configurable method (POST / GET / PUT)
- Threshold-based triggers: `>`, `<`, `>=`, `<=`, `=` operators
- Manual trigger + test fire; active/paused toggle; full trigger history

**Jobs & Scheduling** (`/jobs`)
- Cron-style scheduled pipeline runs (profile, sql_query, cleaning, export types)
- Any authenticated user can run any shared job — not restricted to job owner
- Cleaning jobs apply duplicate-drop and configurable fill operations with before/after row counts
- Job run history with duration, row counts, and status

---

### Security & Developer Tools

**Two-Factor Authentication** (`/2fa`)
- TOTP 2FA — RFC 6238 compliant via `otplib`
- QR code generation for any authenticator app (Google, Authy, 1Password)
- Manual secret entry fallback; 6-digit code verification
- Enable/disable with confirmation modal; status tracked in `tfa_secrets`

**External API** (`/external-api`)
- Self-service API key management: generate, list, revoke
- Per-scope permissions: read / write / admin
- Usage tracking: request count and last-used timestamp
- Integration code examples in curl, Python, and JavaScript

**Report Export / PDF** (`/pdf-export`)
- Styled HTML report with KPI summary, numeric statistics, and categorical breakdowns
- AI narrative section embedded when available
- Report history retrievable by ID; templates selectable per export

---

## Tech Stack

### Frontend
| Technology | Role |
|------------|------|
| React 18 | UI framework with hooks and context |
| Vite 5 | Dev server with HMR; optimized production bundler |
| React Router v6 | Client-side routing across 40+ pages |
| Recharts | Line, bar, area, pie, scatter, and composed charts |
| Leaflet + react-leaflet | Interactive geospatial maps |
| Lucide React | Consistent 500+ icon system |
| react-hot-toast | Non-blocking toast notifications |
| Axios | HTTP client with JWT Authorization interceptor |

### Backend (Node.js)
| Technology | Role |
|------------|------|
| Node.js 18 | Runtime |
| Express 4 | REST API framework — 52 route groups |
| node-postgres (pg) | PostgreSQL client with connection pooling |
| jsonwebtoken | JWT signing and verification (HS256, 7-day expiry) |
| bcryptjs | Password hashing (bcrypt, 10 salt rounds) |
| otplib | TOTP 2FA generation and verification |
| qrcode | QR code image generation for 2FA setup |
| pdfkit | Programmatic PDF report generation |
| node-cache | In-memory LRU query result caching |
| mysql2 | External MySQL connection support |
| Helmet | Full HTTP security header suite |
| express-rate-limit | Per-IP rate limiting (100 req / 15 min) |
| morgan | Structured HTTP request logging |
| axios | HTTP client for Python microservice proxy |

### Python ML Microservice
| Technology | Role |
|------------|------|
| Flask | Lightweight REST framework |
| scikit-learn | Regression, classification, clustering, AutoML |
| pandas | Data manipulation and aggregation |
| NumPy | Numerical operations and array math |
| statsmodels | Statistical tests and time-series decomposition |
| Prophet | Facebook's time-series forecasting library |
| SciPy | Statistical distributions and Monte Carlo sampling |
| flask-cors | Cross-origin request handling |

### Database
| Technology | Role |
|------------|------|
| PostgreSQL | Primary relational data store |
| JSONB columns | Schema metadata, pipeline configs, audit details, ML results |
| 54 tables | Full relational schema across all features |
| Per-dataset tables | `data_N` tables — full SQL access per uploaded dataset |

---

## API Reference

### Authentication
```http
POST /api/auth/login
POST /api/auth/register
GET  /api/auth/me
```

### Datasets — Chunked Pagination
```http
GET    /api/datasets
POST   /api/datasets                                # Upload CSV
GET    /api/datasets/:id
GET    /api/datasets/:id/data?page=1&pageSize=100   # Paginated
GET    /api/datasets/:id/data?limit=500&offset=0    # Legacy (also supported)
GET    /api/datasets/:id/summary
GET    /api/datasets/:id/export/csv                 # Chunked streaming
DELETE /api/datasets/:id
```

### ML Analytics (Python-backed)
```http
POST /api/analytics/:id/regression
POST /api/analytics/:id/clustering
POST /api/analytics/:id/classification
POST /api/analytics/:id/forecast
GET  /api/analytics/:id/outliers
POST /api/analytics/:id/prophet
POST /api/analytics/:id/prescriptive
POST /api/analytics/:id/root-cause
```

### AutoML
```http
POST /api/automl/:datasetId/run     # { target_col, task_type, feature_cols }
GET  /api/automl/runs
```

### Real-Time Streaming (SSE)
```http
GET /api/streaming/stream?type=sales    # text/event-stream
GET /api/streaming/snapshot?type=stock
GET /api/streaming/types
```

### CRM Integrations
```http
# HubSpot
GET    /api/crm/hubspot/status
POST   /api/crm/hubspot/connect             # { token }
GET    /api/crm/hubspot/:object             # contacts | deals | companies
POST   /api/crm/hubspot/import/:object
DELETE /api/crm/hubspot/disconnect

# Salesforce
GET    /api/crm/salesforce/status
POST   /api/crm/salesforce/connect          # { username, password, securityToken }
POST   /api/crm/salesforce/query            # { soql }
DELETE /api/crm/salesforce/disconnect

# Zoho CRM
GET    /api/crm/zoho/status
POST   /api/crm/zoho/connect                # { clientId, clientSecret, refreshToken, dataCenterUrl }
GET    /api/crm/zoho/:module                # Contacts | Leads | Deals | Accounts
POST   /api/crm/zoho/import/:module
DELETE /api/crm/zoho/disconnect
```

### Data Governance
```http
GET  /api/audit                    # ?action=&resource_type=&limit=&offset=
GET  /api/audit/stats
GET  /api/audit/anomalies          # Real-time behavioral scan
GET  /api/audit/compliance         # 5-dimension compliance score
POST /api/audit/log                # { action, resource_type, resource_id, details }
```

### All Route Groups
```
/api/auth            /api/datasets        /api/analytics
/api/cleaning        /api/queries         /api/dashboards
/api/ai              /api/export          /api/profiling
/api/versions        /api/recipes         /api/catalog
/api/collaboration   /api/jobs            /api/reports
/api/audit           /api/pipelines       /api/scenarios
/api/business-questions                   /api/external-api
/api/syntax-helper   /api/nl-to-sql       /api/connectors
/api/workspaces      /api/masking         /api/webhooks
/api/lineage         /api/annotations     /api/automl
/api/geo             /api/pivot           /api/tfa
/api/pdf             /api/narratives      /api/knowledge-graph
/api/streaming       /api/crm
```

---

## Python Microservice Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /analytics/regression` | Linear + polynomial regression — R², RMSE, residual data |
| `POST /analytics/clustering` | K-means — silhouette score, cluster labels, centroid coordinates |
| `POST /analytics/classification` | Random Forest ensemble — accuracy, precision, recall, F1, confusion matrix |
| `POST /analytics/outliers` | IQR + Z-score — per-column outlier indices and boundary values |
| `POST /analytics/forecast` | Time-series decomposition — trend, seasonal, residual components |
| `POST /prophet-forecast` | Facebook Prophet — forecast values + 80%/95% confidence intervals |
| `POST /monte-carlo` | Monte Carlo simulation — histogram, percentiles, mean, std, samples |
| `POST /prescriptive` | RandomForest optimization — ranked action recommendations |
| `POST /root-cause` | Statistical root cause — feature contribution scores |
| `POST /automl` | Multi-model AutoML — cross-val scores, best model, feature importance |
| `POST /pivot-compute` | Server-side pivot aggregation — sum/mean/count/min/max/median by group fields |

---

## Database Schema (54 Tables)

```
Core            users, datasets, data_N (per-dataset)
Processing      cleaning_jobs, data_versions, recipes, recipe_applications
                pipelines, pipeline_runs, quality_checks
Analytics       query_history, scenarios, business_questions
                automl_runs, nl_queries, syntax_sessions
Reporting       reports, dashboards, ai_conversations, export_jobs
Governance      audit_logs, masking_rules, lineage_nodes, lineage_edges
                tfa_secrets, api_keys
Enterprise      workspaces, workspace_members, connectors
                webhooks, alert_history, geo_layers, pivot_configs
                query_cache, crm_connections, streaming_sources
                annotations, integration_credentials
Catalog         catalog_entries, data_profiles
Ops             jobs, job_runs, alerts, alert_triggers
Snapshots       snapshot_N_vM (versioned per dataset)
```

---

## Project Structure

```
/
├── client/                         # React + Vite frontend
│   └── src/
│       ├── pages/                  # 40+ page components
│       │   ├── Dashboard.jsx
│       │   ├── AutoML.jsx
│       │   ├── StreamingDashboard.jsx
│       │   ├── CRMIntegration.jsx  # HubSpot + Salesforce + Zoho
│       │   ├── AuditLogs.jsx       # Logs + Anomaly + Compliance
│       │   ├── KnowledgeGraph.jsx
│       │   └── ...
│       ├── components/
│       │   ├── Layout.jsx          # Sidebar + nav groups
│       │   └── ProtectedRoute.jsx
│       └── api/client.js           # Axios + JWT interceptor
│
├── server/                         # Node.js + Express API
│   └── src/
│       ├── routes/                 # 52 route modules
│       │   ├── analytics.js        # ML proxy (camelCase→snake_case translation)
│       │   ├── audit.js            # Logs + anomalies + compliance checks
│       │   ├── automl.js
│       │   ├── crm.js              # HubSpot + Salesforce + Zoho
│       │   ├── datasets.js         # Upload + paginated fetch + export
│       │   ├── streaming.js        # SSE streams
│       │   └── ...
│       ├── middleware/auth.js      # JWT verify + role check
│       ├── db/pool.js              # pg connection pool
│       └── index.js               # Entry — all 52 routes registered
│
└── python-service/
    └── app.py                      # 10 ML endpoints (Flask)
```

---

## Running Locally

**Prerequisites:** Node.js 18+, Python 3.9+, PostgreSQL

```bash
# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd client && npm install

# Install Python ML dependencies
pip install flask pandas numpy scikit-learn scipy statsmodels prophet flask-cors

# Set environment variables
export DATABASE_URL="postgresql://user:password@localhost:5432/dataanalyst"
export JWT_SECRET="your-secret-key"
export NODE_ENV="development"

# Start all three services (separate terminals)
node server/src/index.js          # API — port 3001
cd client && npm run dev          # Frontend — port 5000
python3 python-service/app.py     # ML service — port 8000
```

---

## Deploying to Railway

### 1. One-Service Deployment (Full Stack on 1 Service)

This is the **recommended** approach. All three layers (frontend, backend, database) run together on one Railway service.

**What you get:**
- Railway automatically creates a PostgreSQL database
- Backend serves both API routes AND static frontend files
- One domain, zero CORS issues
- One environment variable panel

**Steps:**
1. **Create a Railway project** at https://railway.app
2. **Link your GitHub repo** (or deploy from template)
3. **Railway will auto-detect `railway.json`** and build with Nixpacks
4. **Add these environment variables** in Railway Dashboard → Variables:
   - `JWT_SECRET` — generate with `openssl rand -hex 64`
   - `NODE_ENV` = `production`
   - *(Optional)* `ZOHO_CLIENT_ID` + `ZOHO_CLIENT_SECRET` — if you want Zoho CRM
   - *(Optional)* `GROQ_API_KEY` — if you want AI assistant features
   - `DATABASE_URL` — **Railway auto-generates this** when you add a PostgreSQL database
5. **Add a PostgreSQL database** from Railway Dashboard → New → Database
   - Railway injects `DATABASE_URL` automatically
   - Tables auto-create on first run (server handles `CREATE TABLE IF NOT EXISTS`)
6. **Deploy** — the `startCommand` in `railway.json` builds the frontend and starts the backend
7. **The app runs on the single Railway URL** (e.g., `https://your-app.railway.app`)

### Architecture on Railway
```
Your Railway Service
  ├── React frontend (built → served as static files by Express)
  ├── Node.js API (Express routes + PostgreSQL pool)
  └── PostgreSQL (managed by Railway)
```

**Note:** The Python ML microservice is NOT included in the single-service deployment. ML features (regression, classification, clustering, AutoML, Prophet, etc.) will return "Service unavailable" unless you deploy it separately.

---

### 2. Two-Service Deployment (Recommended for Full ML)

If you want **all ML features working**, deploy the Python service as a second Railway service.

**Service 1 — Node.js (Full Stack):**
- Same setup as above, but add: `PYTHON_SERVICE_URL=https://your-ml-service.railway.app`

**Service 2 — Python ML:**
- Deploy `python-service/` as a separate service
- Use `Dockerfile.python` or set a Python Nixpack
- Set `PYTHON_SERVICE_URL` on Service 1 to point to Service 2's URL

```
┌─────────────┐     ┌─────────────┐     ┌───────────┐
│   React     │     │   Node.js   │     │  Python   │
│   (static)  │     │   API       │     │   ML      │
│   served by │     │   + DB      │     │   Service │
│   Express   │     │             │     │           │
└─────────────┘     └──────┬──────┘     └─────┬─────┘
                           │ HTTP              │
                     ┌─────┴─────┐       ┌─────┴─────┐
                     │ PostgreSQL│       │   Flask   │
                     │ (Railway) │       │ + sklearn │
                     └───────────┘       └───────────┘
```

---

### Required Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | ✅ | Auto-generated | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | none | JWT signing — generate a 64-char random string |
| `NODE_ENV` | ✅ | `production` | Tells the server to serve built frontend files |
| `PORT` | ❌ | `3001` | Railway overrides this automatically |
| `PYTHON_SERVICE_URL` | ❌ | none | URL to your deployed Python ML service |
| `ZOHO_CLIENT_ID` | ❌ | none | Zoho CRM OAuth |
| `ZOHO_CLIENT_SECRET` | ❌ | none | Zoho CRM OAuth |
| `GROQ_API_KEY` | ❌ | none | AI assistant (Groq API) |

---

### Monorepo vs Separate Services

This is a **monorepo** (all code in one repo). Railway handles it by:
1. Building the frontend into `client/dist`
2. Running the backend which serves both `/api/*` and static files

You do **NOT** need separate databases. One Railway PostgreSQL service is enough.

**Note:** Railway free tier includes:
- 5 GB disk (PostgreSQL + uploads)
- $5/month credit for compute
- For production, upgrade to Hobby ($5/month) or Pro ($29/month)

---

## Security

- All routes protected with JWT `authenticate` middleware; admin routes additionally require `authorize('admin')`
- Passwords hashed with bcryptjs (10 salt rounds)
- TOTP 2FA available for all accounts (RFC 6238 via `otplib`)
- HTTP security headers via Helmet (XSS, HSTS, CSP, referrer policy)
- Per-IP rate limiting on all endpoints (100 requests / 15 minutes)
- PII masking with 9 mask types applied at query/preview time
- API keys with granular read/write/admin scope permissions
- Full audit log of all user actions including IP address
- Anomaly detection actively monitors for credential stuffing, data exfiltration, and unauthorized access patterns

---

<div align="center">

**DataAnalyst Pro** — Enterprise analytics from ingestion to governance, built end-to-end.

*React · Node.js · Python · PostgreSQL · scikit-learn · Prophet · Leaflet · SSE*

</div>
# DataAnalyst-Pro-3.0
# DataAnalyst-Pro-3.0
