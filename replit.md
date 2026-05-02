# DataAnalyst Pro v3

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

## Navigation Groups (v3)

| Group | Pages |
|-------|-------|
| Overview | Dashboard |
| Data | Data Import, Data Catalog, Version Control |
| Processing | Data Cleaning, Profiling, Recipes, Pipelines |
| Analysis | EDA, Visualization, SQL Editor, ML Analytics |
| Intelligence | AI Assistant, **Business Questions**, Reports, Dashboard Builder |
| **Advanced Analytics** | **Scenario Modeling**, **Prescriptive Analytics** |
| **Developer** | **External API** |
| Collaboration | Comments & Sharing, Jobs & Alerts |
| Admin | Audit Logs |

## v3 New Modules

### Business Question Engine (`/business-questions`)
- Natural language input: "Why did sales drop in Q2?"
- Automatic intent detection (drop/growth/anomaly/trend/comparison)
- Root-cause analysis: correlation detection, outlier flags, distribution skew, missing data
- Severity-ranked findings (high/medium/low)
- AI-written narrative summary
- Auto-generated SQL queries ready to copy/run
- Actionable recommendations per question type
- Dataset-aware suggested questions
- Question history saved to PostgreSQL

### Scenario & Simulation Modeling (`/scenarios`)
- Create named scenarios with multiple variables
- Interactive sliders for each variable (base value, uncertainty, weight, distribution)
- Distribution types: Normal, Uniform, Triangular
- Run what-if simulations — composite weighted impact score
- Monte Carlo simulation (up to 50,000 iterations) via Python service
- Full frequency histogram with P5/P95 risk zones highlighted
- Percentile table (P5–P95)
- Scenarios saved to PostgreSQL with last_result caching

### Prescriptive Analytics (`/prescriptive`)
- **Optimization tab**: RandomForest-powered recommendations — which variables to change and by how much to maximize/minimize a target metric
- Feature importance bar chart
- Current mean vs predicted optimal vs improvement %
- Multi-select feature column picker
- **Prophet Forecast tab**: Facebook Prophet time-series forecasting
  - Handles seasonality (weekly + yearly), trend changes
  - Configurable date/value columns and forecast periods
  - Full forecast table with confidence intervals (yhat_lower/yhat_upper)

### External API (`/external-api`)
- Generate API keys with `dap_` prefix (SHA-256 hashed, never stored in plaintext)
- Per-key: name, permissions (read/write/query), optional expiry, last-used timestamp, request counter
- One-time key reveal on creation
- Revoke any key instantly
- **API Documentation tab** with curl examples for all endpoints:
  - `GET /v1/datasets` — list datasets
  - `GET /v1/datasets/:id/data` — fetch rows (limit/offset pagination)
  - `POST /v1/query` — run SQL against a dataset
  - `GET /v1/profile/:id` — get cached data profile

## Python Service Endpoints (v3 additions)

| Endpoint | Description |
|----------|-------------|
| POST `/monte-carlo` | Monte Carlo simulation — normal/uniform/triangular distributions, up to 50k iterations, returns histogram + percentiles |
| POST `/prophet-forecast` | Facebook Prophet time-series forecasting with confidence intervals |
| POST `/prescriptive` | RandomForest optimization — feature importance + recommendations |
| POST `/root-cause` | Statistical root cause analysis — correlations, outliers, segment breakdown |

## Database Tables (v3 additions)

| Table | Purpose |
|-------|---------|
| scenarios | Scenario configs (variables, assumptions, last result) |
| business_questions | Question history per user/dataset |
| api_keys | Hashed API keys with permissions and usage tracking |
| quality_checks | Continuous data quality check results |

## Full API Route List

### v1 (original)
`/api/auth`, `/api/datasets`, `/api/cleaning`, `/api/queries`, `/api/dashboards`, `/api/ai`, `/api/analytics`, `/api/export`

### v2
`/api/profiling`, `/api/versions`, `/api/recipes`, `/api/catalog`, `/api/collaboration`, `/api/jobs`, `/api/reports`, `/api/audit`, `/api/pipelines`

### v3 (new)
`/api/scenarios`, `/api/business-questions`, `/api/external-api`

### Analytics sub-routes (v3)
`POST /:id/prescriptive`, `POST /:id/prophet`, `POST /:id/root-cause`
