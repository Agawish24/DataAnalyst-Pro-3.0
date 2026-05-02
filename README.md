# DataAnalyst Pro

An enterprise-grade, full-stack data analysis suite. Upload, clean, explore, visualize, and extract AI-driven insights from any dataset — all in one platform.

![DataAnalyst Pro](https://img.shields.io/badge/version-3.0.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=flat-square&logo=postgresql)

---

## Features

### Data Management
- **Data Import** — Upload CSV, Excel, JSON (up to 50 MB) with instant preview
- **Data Catalog** — Searchable metadata library with tags, domains, sensitivity labels, and lineage
- **Version Control** — Snapshot, rollback, and diff any dataset

### Processing
- **Data Cleaning** — Remove duplicates, fill missing values, normalize, trim, detect outliers
- **Automated Profiling** — Distributions, correlations, quality scores generated automatically
- **Transformation Recipes** — Save and reuse preprocessing pipelines across datasets
- **ETL Pipelines** — Build source → transform → destination workflows

### Analysis
- **EDA** — Full statistical summaries, distribution charts, correlation heatmaps
- **Visualization** — Bar, Line, Pie, Scatter, Radar, Doughnut charts (Chart.js)
- **SQL Editor** — Query any dataset with `FROM dataset`, syntax highlighting, history
- **ML Analytics** — Regression, clustering, classification, forecasting, outlier detection

### Intelligence
- **AI Assistant** — Natural language → SQL → visualization
- **Business Question Engine** — Ask "Why did sales drop in Q2?" and get ranked findings, root-cause analysis, auto-generated SQL, and recommendations
- **Reports** — AI-generated narrative reports with markdown summaries
- **Dashboard Builder** — Multi-widget dashboards with stat cards, charts, tables

### Advanced Analytics
- **Scenario Modeling** — What-if analysis with variable sliders and Monte Carlo simulation (up to 50,000 iterations)
- **Prescriptive Analytics** — RandomForest-powered optimization recommendations + Facebook Prophet time-series forecasting

### Collaboration & Operations
- **Comments & Annotations** — Threaded comments and column-level annotations on any resource
- **Sharing** — Grant read/edit/admin access per resource
- **Jobs & Alerts** — Schedule recurring analyses, set SQL-threshold alerts
- **Audit Logs** — Full admin-only activity log with export

### Developer
- **External API** — Generate scoped API keys (`dap_` prefix) to query your datasets from external apps

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Chart.js, Lucide Icons |
| Backend | Node.js 18, Express 5, JWT auth, Multer |
| Database | PostgreSQL 15 (27 tables) |
| ML Service | Python 3, Flask, scikit-learn, statsmodels, Prophet |
| Auth | JWT (RS256), bcrypt, role-based (admin / analyst / viewer) |
| i18n | English + Arabic (RTL) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+
- PostgreSQL 15+

### 1. Clone the repo
```bash
git clone https://github.com/your-username/dataanalyst-pro.git
cd dataanalyst-pro
```

### 2. Set environment variables
```bash
cp .env.example .env
# Edit .env and fill in DATABASE_URL and JWT_SECRET
```

### 3. Install dependencies
```bash
# Node (root + client)
npm install
cd client && npm install && cd ..

# Python
pip install flask flask-cors pandas numpy scikit-learn statsmodels prophet
```

### 4. Set up the database
```bash
# Run the schema migration
node server/src/db/migrate.js

# Seed demo users
node server/src/db/seed.js
```

### 5. Start all services
```bash
# Terminal 1 — Backend API (port 3001)
node server/src/index.js

# Terminal 2 — Python ML service (port 8000)
python3 python-service/app.py

# Terminal 3 — React frontend (port 5000)
cd client && npm run dev
```

Open [http://localhost:5000](http://localhost:5000)

---

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| demo@dataanalyst.com | demo123 | admin |
| analyst@dataanalyst.com | analyst123 | analyst |

---

## API Overview

### Authentication
All routes require a JWT Bearer token from `POST /api/auth/login`.

### Core Routes
| Route | Description |
|-------|-------------|
| `POST /api/auth/login` | Sign in, returns JWT |
| `POST /api/auth/register` | Create account |
| `GET /api/datasets` | List datasets |
| `POST /api/datasets/upload` | Upload a file |
| `POST /api/analytics/:id/regression` | Run regression |
| `POST /api/analytics/:id/prescriptive` | Optimization recommendations |
| `POST /api/analytics/:id/prophet` | Prophet forecast |
| `POST /api/business-questions/analyze` | Root-cause analysis |
| `POST /api/scenarios/monte-carlo` | Monte Carlo simulation |
| `GET /api/external-api/v1/datasets` | External API (API key auth) |

### External API (API key)
Pass `X-Api-Key: dap_your_key` or `?api_key=dap_your_key`:

```bash
# List datasets
curl -H "X-Api-Key: dap_xxx" https://your-domain/api/external-api/v1/datasets

# Query a dataset
curl -X POST -H "X-Api-Key: dap_xxx" -H "Content-Type: application/json" \
  -d '{"sql":"SELECT * FROM dataset LIMIT 10","dataset_id":1}' \
  https://your-domain/api/external-api/v1/query
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Random secret for signing JWTs (min 32 chars) |
| `NODE_ENV` | No | `development` or `production` |
| `PORT` | No | API server port (default: 3001) |
| `PYTHON_SERVICE_URL` | No | Python service URL (default: http://localhost:8000) |

---

## Project Structure

```
dataanalyst-pro/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── pages/           # 23 page components
│       ├── components/      # Layout, shared UI
│       ├── context/         # Auth + Data context
│       └── api/             # Axios client
├── server/                  # Node.js + Express API
│   └── src/
│       ├── routes/          # 20 route modules
│       ├── middleware/       # Auth, error handling
│       ├── helpers/          # Stats, data cleaning
│       └── db/              # Pool, migrations, seed
├── python-service/          # Flask ML microservice
│   └── app.py               # All ML endpoints
├── .env.example             # Environment variable template
└── README.md
```

---

## License

MIT
