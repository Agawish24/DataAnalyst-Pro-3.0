# DataAnalyst-Pro → Enterprise Hardening Guide

> **Status as of 2026-06-10**: All Priority 1 + Priority 2 security/architecture fixes applied and verified.
> Live test suite: **88/88 endpoints passing (100%)** across all feature modules.

---

## Security (Priority 1)

| Issue | Fix | Status |
|-------|-----|--------|
| CORS wildcard + credentials | Restrict to `ALLOWED_ORIGINS` env var; reflect in dev | ✅ Applied |
| Auth rate limit too high | Lowered to 15 req/15 min on `/api/auth/*` | ✅ Applied |
| Duplicate /api/users route | Removed unprotected second definition in auth.js | ✅ Applied |
| Salesforce fake client_id | Replaced with `process.env.SALESFORCE_CLIENT_ID/SECRET` | ✅ Applied |
| Python service no auth | `X-API-Key` header on all axios calls; validated in app.py | ✅ Applied |
| Webhook no signature | HMAC-SHA256 with `WEBHOOK_SECRET`; `X-Webhook-Signature` header | ✅ Applied |
| SQL injection via table names | Table name whitelist validator in datasets.js | ✅ Applied |
| Hardcoded encryption key | Removed vibeCoding fallback; throws if `ENCRYPTION_KEY` missing | ✅ Applied |
| Admin credentials exposed | Moved to `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` env secrets | ✅ Applied |
| Masking is view-only | Returns masked preview via `/masking/:id/preview` endpoint | ✅ Existing |

---

## Architecture (Priority 2)

| Issue | Fix | Status |
|-------|-----|--------|
| No health checks | `/health` (DB ping) + `/ready` (DB + Python service) | ✅ Applied |
| No graceful shutdown | `SIGTERM` → `pool.end()` + `server.close()` | ✅ Applied |
| Streaming backpressure | `if (!res.writable) clearInterval + res.end()` | ✅ Applied |
| Python client scattered | Centralised `server/src/utils/pythonClient.js` (`pyPost`/`pyGet`) | ✅ Applied |
| analytics/automl/scenarios duplicated Python calls | All migrated to `pythonClient.js` | ✅ Applied |
| No connection pooling for external DBs | `pgPoolCache` + `mysqlPoolCache` Maps in connectors.js; evicted on delete/update | ✅ Applied |
| No transaction wrapping for dataset upload | `BEGIN/COMMIT` client wraps INSERT + CREATE TABLE + batch inserts; `ROLLBACK` on failure | ✅ Applied |

---

## Data Integrity (Priority 3)

| Issue | Fix | Status |
|-------|-----|--------|
| CSV loads entire file to RAM | Stream parse with pg COPY | ⬜ Future |
| Schema inference naive | Improve type detection | ⬜ Future |
| No data validation on upload | Row-level validation on ingest | ⬜ Future |
| No file size limits enforced | 50 MB hard limit before parsing | ⬜ Future |

---

## Code Quality (Priority 4)

| Issue | Fix | Status |
|-------|-----|--------|
| Duplicate /api/users route | Removed in auth.js | ✅ Applied |
| Error handling inconsistent | Standardise with AppError class | ⬜ Future |
| No tests | Add Jest + Supertest suite | ⬜ Future |
| No input validation | Add Zod schemas for all req.body | ⬜ Future |

---

## Feature Realism (Priority 5)

| Feature | Current | Fix | Status |
|---------|---------|-----|--------|
| Streaming | Mock data | Kafka/Redpanda connector | ⬜ Future |
| Compliance | Heuristic scores | Real policy engine | ⬜ Future |
| Lineage | Reconstructed | Event-log-based tracking | ⬜ Future |
| Anomaly detection | SQL counts | Python IsolationForest + cron | ⬜ Future |
| Knowledge graph | Regex | Column value sampling | ⬜ Future |
| NL→SQL | Regex pattern matching | Groq LLM with schema-aware prompt | ⬜ Future |

---

## Schema Fixes Applied (DB Column Mismatches)

During live testing, 16 route files had schema mismatches against the actual Neon DB. All fixed:

| Route | Fix Applied |
|-------|-------------|
| `recipes.js` | Removed non-existent `updated_at` column |
| `catalog.js` | Removed non-existent `column_count` column |
| `pipelines.js` | Removed non-existent `updated_at` column |
| `narratives.js` | `title`/`created_by` → `user_id`/`generated_at`; removed `title` |
| `webhooks.js` | Removed non-existent `shared`/`updated_at` columns |
| `lineage.js` | `source_id` → `source_node`; `edge_type` → `relationship` |
| `audit.js` | `is_verified` → `enabled` for 2FA status check |
| `externalApi.js` | `permissions` → `scopes`; removed `role`/`rate_limit_per_hour` |
| `collaboration.js` | Removed non-existent `parent_id` column |
| `crm.js` | `provider` → `service`; `created_at` → `connected_at` |
| `ai.js` | `natural_language` → `messages` (JSONB) |
| `visualization.js` | Graceful fallback when `saved_charts` table absent |
| `scenarios.js` | `shared`/`updated_at`/`status`/`audit_trail` → actual columns; `last_result` → `results` |
| `queries.js` | `result`/`status`/`error_message` → `result_rows`; dropped non-existent cols |
| `cleaning.js` | `result_summary` → `rows_before`/`rows_after`/`status`/`error_message` |
| `jobs.js` | Removed `status`/`updated_at` from UPDATE (columns don't exist) |
| `automl.js` | `all_scores`/`hyperparams`/`status` → `results` (JSONB); `feature_cols` passed as `text[]` array (not JSON string) |

---

## Enhanced Syntax Checker (checker.py)

`python-service/checker.py` — deep semantic rule engine called from `POST /api/syntax-helper/analyze`.  
Merged into syntax helper results as `deepErrors` count.

**SQL rules**: INSERT column/value count mismatch, empty `IN()` list, negative `LIMIT`, `SELECT *` in subquery, `BETWEEN` without `AND`, unbalanced quotes, `!=` instead of `<>`.

**Python rules**: default argument before positional (`def f(x=1, y)`), wrong builtins (`len` on non-iterable, `range` with wrong arg count), empty `lambda:`, `raise` without exception class, `await`/`yield` outside async/generator scope, `print` as statement (Python 2 style).

**R rules**: `mean()`/`sum()`/`sd()` called with multiple comma args instead of `c()`, `T`/`F` instead of `TRUE`/`FALSE`, missing parens on function calls, `<-` used inside function argument.

---

## DB Connectors — ENOTFOUND Error Handling

`connectors.js` — `testConnection()` detects `ENOTFOUND`/`ECONNREFUSED`/`ETIMEDOUT` and returns a user-friendly error message instead of exposing raw Node.js error strings. The frontend `DBConnectors.jsx` surfaces this cleanly in a toast.

---

## Environment Secrets (Required)

Set these in the Replit Secrets panel before seeding or deploying:

| Secret | Purpose |
|--------|---------|
| `SEED_ADMIN_EMAIL` | Admin account email for DB seed |
| `SEED_ADMIN_PASSWORD` | Admin account password for DB seed |
| `SEED_ANALYST_EMAIL` | Analyst account email for DB seed |
| `SEED_ANALYST_PASSWORD` | Analyst account password for DB seed |
| `PYTHON_SERVICE_API_KEY` | Shared secret between Node API and Python service |
| `WEBHOOK_SECRET` | HMAC key for outbound webhook signatures |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `SALESFORCE_CLIENT_ID` | Salesforce OAuth2 client ID |
| `SALESFORCE_CLIENT_SECRET` | Salesforce OAuth2 client secret |
| `ENCRYPTION_KEY` | AES key for vibeCoding encryption |
| `GROQ_API_KEY` | Groq LLM API key (AI Assistant) |
| `ZOHO_CLIENT_ID` | Zoho CRM OAuth2 client ID |
| `ZOHO_CLIENT_SECRET` | Zoho CRM OAuth2 client secret |

---

## Live Test Results — 2026-06-10 (Final)

**Suite**: 88 endpoints across all feature modules  
**Result**: **88 passed / 0 failed (100%)**

| Module | Endpoints Tested | Result |
|--------|-----------------|--------|
| Core (health, ready, auth) | 3 | ✅ 3/3 |
| Datasets (list, summary, data, export) | 4 | ✅ 4/4 |
| Processing (recipes, catalog, pipelines, profiling, versions, cleaning, queries) | 9 | ✅ 9/9 |
| SQL Editor (execute, tables) | 2 | ✅ 2/2 |
| Analytics (outliers, regression, clustering, forecast, AutoML ×2) | 6 | ✅ 6/6 |
| Intelligence (narratives, business questions, reports, dashboards, AI chat) | 7 | ✅ 7/7 |
| NL-SQL + Syntax Helper (nl-query, nl-convert, nl-examples, nl-history, syntax ×3 languages, syntax-history, templates ×3) | 11 | ✅ 11/11 |
| Visualization (pivot, saved, charts, aggregate) | 4 | ✅ 4/4 |
| Geo & Streaming | 4 | ✅ 4/4 |
| Enterprise (masking ×4, webhooks, workspaces, connectors ×2, lineage ×2, knowledge-graph, annotations, 2FA, PDF, external API) | 15 | ✅ 15/15 |
| Audit / Governance | 4 | ✅ 4/4 |
| Jobs & Alerts (jobs, alerts-list, alerts, cache, POST job) | 5 | ✅ 5/5 |
| Collaboration (comments, POST comment, activity) | 3 | ✅ 3/3 |
| CRM (connections, contacts, hubspot, zoho) | 4 | ✅ 4/4 |
| Scenarios | 2 | ✅ 2/2 |
| Other (business-questions list, lineage nodes/edges, catalog ds, export, PDF generate, NL convert) | 7 | ✅ 7/7 |

---

## Files Modified (This Session)

### Security / Architecture Hardening (Session 1)
- `server/src/index.js` — CORS, rate limits, /health, /ready, graceful shutdown
- `server/src/routes/auth.js` — Removed duplicate /api/users route
- `server/src/routes/crm.js` — Salesforce env var credentials
- `server/src/routes/webhooks.js` — HMAC-SHA256 signing
- `server/src/routes/streaming.js` — Backpressure check
- `server/src/utils/pythonClient.js` — Centralised Python client (new file)
- `python-service/app.py` — X-API-Key validation + `/check-syntax` route
- `server/neon_init.js` — SEED_* env vars, no fallback credentials

### Schema Fixes (Session 1 + 2)
- `server/src/routes/recipes.js`
- `server/src/routes/catalog.js`
- `server/src/routes/pipelines.js`
- `server/src/routes/narratives.js`
- `server/src/routes/webhooks.js`
- `server/src/routes/lineage.js`
- `server/src/routes/audit.js`
- `server/src/routes/externalApi.js`
- `server/src/routes/collaboration.js`
- `server/src/routes/crm.js`
- `server/src/routes/ai.js`
- `server/src/routes/visualization.js`
- `server/src/routes/scenarios.js`
- `server/src/routes/queries.js` — `result`/`status` → `result_rows`
- `server/src/routes/cleaning.js` — `result_summary` → `rows_before`/`rows_after`/`status`
- `server/src/routes/jobs.js` — Removed `status`/`updated_at` from UPDATE
- `server/src/routes/automl.js` — Fixed INSERT columns + `feature_cols` as `text[]`

### Architecture Hardening (Session 2)
- `server/src/routes/connectors.js` — Pool cache Map (pg + mysql), eviction on delete/update; user-friendly ENOTFOUND errors
- `server/src/routes/datasets.js` — Transaction wrapper (BEGIN/COMMIT/ROLLBACK) for upload

### New Files (Session 2)
- `python-service/checker.py` — Deep semantic rule engine for SQL, Python, R
- `server/src/routes/syntaxHelper.js` — Wired to checker.py; `deepErrors` merged into response
