/full_project_test_suite
# Act as QA + Senior Engineers across full stack, data engineering, and data science.
# Goal: Build and run a comprehensive test harness that validates ALL features of DataAnalyst Pro
# using real demo datasets and synthetic edge cases. Ensure 100% feature coverage.

# --- General Requirements ---
- Use demo datasets (Sales, HR, Financial, E-Commerce, Marketing, IoT, Churn) plus synthetic edge cases (missing values, extreme outliers, malformed CSV).
- Run automated tests across frontend, backend, ML microservice, and database.
- Verify correctness, performance, and error handling.
- Log results with pass/fail, duration, and error messages.

# --- Data Ingestion & Management ---
- Test CSV upload (valid + malformed).
- Test Google Sheets import via public CSV URL.
- Test CRM connectors (HubSpot, Salesforce, Zoho) with sandbox/demo accounts.
- Validate schema inference, type detection, and error handling for unreachable hosts.

# --- Data Cleaning & Processing ---
- Run cleaning jobs on datasets with missing values, duplicates, type mismatches.
- Verify fill strategies (mean, median, mode, constant, forward-fill, drop).
- Confirm before/after row counts and job history logging.
- Test pipeline builder with multi-step transformations and rollback.

# --- SQL & Syntax Helper ---
- Run valid SQL queries (SELECT, JOIN, GROUP BY).
- Run invalid SQL queries (typos, incomplete clauses, type mismatches).
- Confirm Syntax Helper flags errors in SQL, Python, and R.
- Validate auto-fix suggestions apply correctly.

# --- Analysis & Visualization ---
- Test profiling (stats, correlation matrix, quality score).
- Test pivot tables with all aggregators.
- Test visualization builder (line, bar, scatter, pie).
- Test geospatial maps with lat/lng columns.

# --- Machine Learning & AutoML ---
- Run regression, classification, clustering, outlier detection, forecasting.
- Validate Prophet forecasts with horizon 7–365 days.
- Run AutoML with classification and regression tasks; confirm best model selection.
- Test Monte Carlo simulations with 50,000 iterations.
- Validate prescriptive analytics recommendations.

# --- Real-Time Streaming ---
- Test SSE feeds (Sales, Stock, IoT, Marketing, E-Commerce).
- Test dataset replay mode with configurable speed.
- Validate auto-reconnect and rolling-window chart updates.

# --- Governance & Compliance ---
- Test audit logs for login, upload, query, export, delete.
- Trigger anomaly detection (high-volume activity, login failures, off-hours access).
- Run compliance checks (2FA, PII masking, API key rotation, lineage coverage).
- Validate masking rules applied correctly.

# --- Collaboration & Operations ---
- Test multi-tenant workspaces with role isolation.
- Test annotations (column, row, chart, dataset, metric).
- Test jobs & scheduling with cron-style runs.
- Test webhooks & alerts with threshold triggers.

# --- Security & External API ---
- Test 2FA setup and verification.
- Test API key generation, usage tracking, and revocation.
- Test PDF export with KPI summary and AI narrative section.

# --- Deliverables ---
- Automated test harness covering all modules.
- Logs with pass/fail + error messages.
- Synthetic datasets for edge cases.
- Documentation of test coverage and results.
