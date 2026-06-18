/enterprise_full_audit_and_feature_upgrade
# Act as a combined team of:
# - Senior Full‑Stack Engineer
# - Senior Data Analyst
# - Senior Data Engineer
# - Senior Data Scientist
#
# Goal: Audit, refactor, and extend the DataAnalyst Pro project to enterprise standards.
# Ensure all features work 100% with real data, add missing syntax checks, and implement
# prioritized extra features from the roadmap. No unrealistic AI hallucinations.

# --- Phase 1: Audit & Fix ---
- Audit backend (Node.js + Express) for API correctness, error handling, and security.
- Audit frontend (React + Vite) for state management, protected routes, and responsiveness.
- Audit Python ML microservice for reproducibility, input validation, and monitoring.
- Audit PostgreSQL schema (54 tables) for consistency, indexing, and migrations.
- Extend Syntax Helper to catch missed errors in SQL, Python, and R.
- Add automated tests for ingestion, cleaning, SQL, ML, visualization, governance.

# --- Phase 2: Test Harness ---
- Build end‑to‑end test suite using demo datasets + synthetic edge cases.
- Validate ingestion (CSV, Google Sheets, CRM connectors).
- Validate cleaning jobs (missing values, duplicates, type mismatches).
- Validate SQL editor + Syntax Helper with valid/invalid queries.
- Validate ML endpoints (regression, classification, clustering, Prophet, AutoML).
- Validate visualization builder, pivot tables, geospatial maps.
- Validate streaming SSE feeds with reconnect logic.
- Validate governance (audit logs, anomalies, compliance checks, masking).
- Log results with pass/fail, duration, and error messages.

# --- Phase 3: Extra Features Roadmap ---
## Security & Compliance
- Role‑based data masking (different rules per role).
- Field‑level encryption with key rotation.
- Audit replay for compliance investigations.

## Advanced Analytics
- Explainable AI (SHAP/LIME) for AutoML models.
- Bias & fairness checks across demographic groups.
- Scenario comparison dashboards (Monte Carlo, forecasting side‑by‑side).

## Data Engineering & Ops
- Data pipeline unit tests for each recipe step.
- Streaming anomaly detection for IoT/financial feeds.
- Data contracts with automated schema validation.

## Developer & Integration Tools
- Optional GraphQL API layer alongside REST.
- Custom connector SDK for proprietary systems.
- Event bus integration (Kafka/Redis/WebSocket optional).

## Testing & Quality
- Synthetic data generator for edge cases.
- End‑to‑end test runner (ingestion → cleaning → SQL → ML → visualization → governance).
- Performance benchmarking dashboards (query latency, ML training time, streaming throughput).

## Intelligence Layer
- Knowledge graph enrichment with external datasets (census, financial indices).
- Narrative comparison across datasets.
- Causal inference module (DoWhy/EconML).

# --- Deliverables ---
- Refactored codebase with enterprise‑grade standards.
- Extended Syntax Helper with full error detection.
- Automated test harness with demo + synthetic datasets.
- Documentation updated with roadmap features.
- Deployment instructions updated for Railway single‑service and two‑service setups.
