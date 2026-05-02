# DataAnalyst Pro

A full-stack data analyst web application with React frontend, Node.js/Express backend, PostgreSQL database, and a Python Flask microservice for advanced analytics.

## Architecture

```
/
├── client/          # React + Vite frontend (port 5000)
├── server/          # Node.js + Express API (port 3001)
└── python-service/  # Flask ML microservice (port 8000)
```

## Workflows

- **Start application** — `cd client && npm run dev` — serves the React frontend on port 5000 (webview)
- **Backend API** — `node server/src/index.js` — Express API on port 3001
- **Python Analytics** — `python3 python-service/app.py` — Flask ML service on port 8000

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| demo@dataanalyst.com | demo123 | admin |
| analyst@dataanalyst.com | analyst123 | analyst |

## Features

### Phase 1: Data Import + Cleaning + SQL Editor ✅
- Upload CSV, Excel (.xlsx/.xls), JSON (up to 50MB)
- Data quality reports (missing values, duplicates, outliers)
- Cleaning operations: remove duplicates, fill missing values, normalize, trim strings
- SQL editor with `FROM dataset` alias, history, and Excel export

### Phase 2: Visualization + Dashboards ✅
- Interactive charts: Bar, Line, Pie, Doughnut, Scatter, Radar (Chart.js)
- Multiple color palettes and aggregation options
- Dashboard builder with drag-and-drop-style widgets (stat cards, charts, text, tables)

### Phase 3: AI Assistant ✅
- Natural language → SQL using a rule-based NL engine
- Auto-suggests visualization type based on query
- Dataset-aware query suggestions

### Phase 4: Advanced Analytics ✅
- Regression (Linear, Random Forest) via Python/scikit-learn
- Clustering (KMeans, DBSCAN)
- Classification (Random Forest, Logistic)
- Time-series forecasting (Exponential Smoothing, ARIMA)
- Outlier detection (Isolation Forest)

### Other ✅
- JWT authentication with role-based access (admin, analyst, viewer)
- Multi-language support (English/Arabic) with RTL layout
- Export to CSV and Excel
- Responsive dark-theme UI

## Database Schema

- **users** — id, name, email, role, password_hash, created_at
- **datasets** — id, name, source, schema (JSONB), row_count, uploaded_by, created_at
- **queries** — id, dataset_id, user_id, sql_text, result (JSONB), execution_time_ms
- **dashboards** — id, name, layout (JSONB), widgets (JSONB), created_by
- **ai_conversations** — id, user_id, dataset_id, natural_language, generated_sql
- **data_cleaning_jobs** — id, dataset_id, operation, parameters, result_summary
- **data_{id}** — dynamic tables created per uploaded dataset

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Register |
| GET | /api/auth/me | Get current user |
| POST | /api/datasets/upload | Upload CSV/Excel/JSON |
| GET | /api/datasets | List datasets |
| GET | /api/datasets/:id | Get dataset + preview |
| GET | /api/datasets/:id/summary | Statistical summary |
| POST | /api/cleaning/:id/apply | Apply cleaning op |
| POST | /api/cleaning/:id/preview | Preview cleaning op |
| GET | /api/cleaning/:id/quality | Data quality report |
| POST | /api/queries/execute | Run SQL query |
| GET | /api/queries/history | Query history |
| POST | /api/ai/query | Natural language → SQL |
| GET | /api/ai/suggestions/:id | AI query suggestions |
| POST | /api/analytics/:id/regression | ML regression |
| POST | /api/analytics/:id/clustering | ML clustering |
| POST | /api/analytics/:id/classification | ML classification |
| POST | /api/analytics/:id/forecast | Time-series forecast |
| GET | /api/analytics/:id/outliers | Outlier detection |
| GET | /api/export/dataset/:id/excel | Export to Excel |
| GET | /api/export/dataset/:id/csv | Export to CSV |
| CRUD | /api/dashboards | Dashboard management |
