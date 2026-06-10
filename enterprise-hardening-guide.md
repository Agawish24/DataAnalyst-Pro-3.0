# DataAnalyst-Pro → Enterprise Hardening Guide

## Security (Priority 1)

| Issue | Fix | Command |
|-------|-----|---------|
| CORS wildcard + credentials | Restrict to known origins | Replace `cors({origin:'*'})` with `cors({origin:['http://localhost:5000','https://yourdomain.com'],credentials:true})` |
| SQL injection via table names | Use parameterized identifiers | Replace all template-literal table names with pg-format or a table name whitelist validator |
| Hardcoded encryption key | Move to env, fail if missing | Remove fallback in vibeCoding.js — throw if ENCRYPTION_KEY missing |
| Auth rate limit too high | Lower to 10 req/min on auth | Change max:2000 to max:10 for /api/auth/* routes specifically |
| Duplicate /api/users route | Remove unprotected version | Delete second /api/users in auth.js, keep admin-only one |
| Salesforce fake client_id | Remove or require env vars | Replace hardcoded client_id/secret with process.env.SALESFORCE_CLIENT_ID |
| Python service no auth | Add shared secret header | Add X-API-Key header to all axios calls to PYTHON_SERVICE; validate in app.py |
| Masking is view-only | Apply at query layer | Intercept all dataset queries through a masking middleware before returning rows |
| Webhook no signature | Add HMAC-SHA256 | Sign outbound webhooks with WEBHOOK_SECRET; include X-Webhook-Signature header |

## Architecture (Priority 2)

| Issue | Fix | Command |
|-------|-----|---------|
| No connection pooling for external DBs | Reuse pools | Store PgPool/mysql connections in a Map keyed by connector ID; close on connector delete |
| No transaction wrapping | Wrap dataset creation | BEGIN → INSERT dataset → CREATE TABLE → COMMIT; ROLLBACK on any failure |
| Inline routes in index.js | Extract to route files | Move /api/users, /api/alerts, /api/api-keys, /api/cache to dedicated route modules |
| No health checks | Add /health and /ready | Add DB connectivity check to /health; add /ready that verifies Python service + DB |
| No graceful shutdown | Handle SIGTERM | Process.on('SIGTERM', () => pool.end() + server.close()) |
| Streaming backpressure | Check res.writable | In setInterval, if !res.writable then clearInterval and end |

## Data Integrity (Priority 3)

| Issue | Fix | Command |
|-------|-----|---------|
| CSV loads entire file to RAM | Stream parse | Replace csv-parser accumulation with stream-to-DB pipeline using pg COPY |
| Schema inference naive | Use type detection library | Replace 80% numeric heuristic with inferjs or custom type detector |
| No data validation on upload | Add row-level validation | Validate each row against inferred schema; reject rows with type mismatches > 5% |
| No file size limits enforced | Add strict limits | Enforce 50MB limit before parsing; return 413 if exceeded |

## Code Quality (Priority 4)

| Issue | Fix | Command |
|-------|-----|---------|
| Two NL→SQL engines | Consolidate to one | Delete ai.js nlToSQL; route /api/ai/chat to nlToSql.js handler |
| Duplicate auth routes | Remove one | Delete unprotected /api/users in auth.js |
| No tests | Add test suite | Add Jest + Supertest; test auth, datasets, analytics routes |
| No input validation | Add Joi/Zod schemas | Validate all req.body with Zod schemas before route handlers |
| Error handling inconsistent | Standardize | Create AppError class; replace all res.status(500).json({error: e.message}) with next(error) |

## Feature Realism (Priority 5)

| Feature | Current | Fix |
|---------|---------|-----|
| Streaming | Mock data | Add Kafka/Redpanda connector option; keep mock as fallback |
| Compliance | Fake scores | Integrate with real policy engine or remove; don't show fake scores |
| Lineage | Reconstructed | Track lineage at execution time via event log; don't reconstruct from queries table |
| Anomaly detection | SQL counts | Use Python IsolationForest on audit_logs; schedule as cron job |
| Knowledge graph | Regex | Use actual column value sampling for entity detection, not just names |
| NL→SQL | Regex | Integrate real LLM (Groq) with schema-aware prompt; keep regex as fallback |

## Quick Start for Replit Agent

```bash
# 1. Fix critical security issues first
sed -i "s/origin: '\*'/origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5000']/g" server/src/index.js

# 2. Add SQL injection protection
npm install pg-format
# Replace all template-literal table names with format('%I', tableName)

# 3. Add request validation
npm install zod
# Create schemas/ directory with Zod validators for all routes

# 4. Add tests
npm install --save-dev jest supertest
# Write tests for auth, dataset upload, and ML proxy routes

# 5. Fix duplicate route
# Delete lines 185-192 in server/src/routes/auth.js (second /users definition)

# 6. Add Python service auth
# Add @app.before_request in app.py to check X-API-Key header
```

## Files to Modify (in order)

1. `server/src/index.js` — CORS, extract inline routes
2. `server/src/routes/auth.js` — Remove duplicate route, add rate limit
3. `server/src/routes/datasets.js` — Parameterized table names, transactions, streaming upload
4. `server/src/routes/vibeCoding.js` — Remove hardcoded encryption key
5. `server/src/routes/crm.js` — Remove fake Salesforce credentials
6. `server/src/routes/audit.js` — Remove fake compliance scores or add real checks
7. `server/src/routes/lineage.js` — Track lineage at execution time, not reconstruction
8. `python-service/app.py` — Add API key validation, model caching
9. `server/src/middleware/` — Add Zod validation middleware, masking middleware
10. `server/src/db/pool.js` — Add connection health check, graceful shutdown
