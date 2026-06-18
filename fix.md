/enterprise_audit_and_fix
# Act as a combined team of:
# - Senior Full‑Stack Engineer
# - Senior Data Analyst
# - Senior Data Engineer
# - Senior Data Scientist
#
# Goal: Audit and refactor the entire DataAnalyst Pro project to enterprise standards,
# ensuring production readiness, maintainability, and correctness.
# No unrealistic AI features — only implementable, maintainable fixes.

# --- General Audit ---
- Verify all 52 Express route groups are correctly wired, secured, and documented.
- Ensure 54 PostgreSQL tables match schema definitions in README; add migrations if missing.
- Audit 40+ React pages for consistent state management, protected routes, and responsive design.
- Confirm JWT auth, role‑based access control, and 2FA are enforced across frontend + backend.
- Add automated test coverage (unit + integration) for API, ML endpoints, and frontend components.
- Ensure CI/CD pipeline runs linting, tests, and builds before deploy.

# --- Backend (Node.js + Express) ---
- Harden middleware: Helmet, rate limiting, CORS, compression, logging.
- Validate all API inputs (datasets, CRM connectors, SQL queries) with schema checks.
- Add error handling for external connectors (HubSpot, Salesforce, Zoho).
- Ensure SSE streaming endpoints handle disconnect/reconnect gracefully.
- Implement caching (node-cache) consistently for query results.

# --- Python ML Microservice ---
- Verify Flask endpoints (regression, clustering, classification, Prophet, Monte Carlo).
- Add input validation (pandas schema checks) before model execution.
- Ensure reproducibility: lock scikit-learn, statsmodels, Prophet versions.
- Add logging + monitoring for ML runs (duration, errors, metrics).
- Document limitations clearly (e.g., Prophet horizon max, Monte Carlo iteration limits).

# --- Database (PostgreSQL) ---
- Audit JSONB usage for schema metadata; ensure indexes exist for performance.
- Validate per‑dataset `data_N` tables for consistency and cleanup orphaned tables.
- Add migrations for audit_logs, masking_rules, lineage tables, etc.
- Ensure snapshot tables (`snapshot_N_vM`) are versioned and cleaned after retention limit.

# --- Data Engineering ---
- Audit ingestion (CSV, Google Sheets, CRM connectors) for schema inference correctness.
- Add retry logic + error logging for external connectors.
- Ensure pipeline builder supports rollback and logs row counts/duration.
- Add monitoring hooks for failed jobs and scheduled tasks.

# --- Data Analysis ---
- Extend Syntax Helper to catch missed errors:
  - SQL: incomplete clauses, type mismatches, misuse of functions, invalid operators.
  - Python: invalid signatures, misuse of built‑ins, yield/return/break outside scope.
  - R: type mismatches, empty calls, invalid argument lists, undefined variables.
- Add test harness with broken snippets + expected error outputs.

# --- Data Science ---
- Audit AutoML module: confirm cross‑validation, metric reporting, and feature importance.
- Ensure Prophet forecasting endpoints handle seasonality modes correctly.
- Add drift monitoring for classification/regression models.
- Document prescriptive analytics limitations (RandomForest optimization scope).

# --- Governance & Compliance ---
- Verify audit logs capture all user actions (login, upload, query, export).
- Ensure anomaly detection thresholds match enterprise standards.
- Confirm compliance checks (2FA, PII masking, API key rotation, lineage coverage).
- Add remediation recommendations inline with compliance results.

# --- Deliverables ---
- Refactored codebase with enterprise‑grade standards.
- Extended Syntax Helper with full error detection for SQL, Python, R.
- Automated test suite across backend, frontend, ML, and pipelines.
- Deployment instructions updated for Railway single‑service and two‑service setups.
- Documentation updated to match actual architecture and modules.
