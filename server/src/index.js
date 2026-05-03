require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const datasetRoutes = require('./routes/datasets');
const cleaningRoutes = require('./routes/cleaning');
const queryRoutes = require('./routes/queries');
const dashboardRoutes = require('./routes/dashboards');
const aiRoutes = require('./routes/ai');
const analyticsRoutes = require('./routes/analytics');
const exportRoutes = require('./routes/export');
const { router: profilingRouter } = require('./routes/profiling');
const versionsRouter = require('./routes/versions');
const recipesRouter = require('./routes/recipes');
const catalogRouter = require('./routes/catalog');
const collaborationRouter = require('./routes/collaboration');
const jobsRouter = require('./routes/jobs');
const reportsRouter = require('./routes/reports');
const auditRouter = require('./routes/audit');
const pipelinesRouter = require('./routes/pipelines');
const scenariosRouter = require('./routes/scenarios');
const businessQuestionsRouter = require('./routes/businessQuestions');
const externalApiRouter = require('./routes/externalApi');
const syntaxHelperRouter = require('./routes/syntaxHelper');
const nlToSqlRouter = require('./routes/nlToSql');
const connectorsRouter = require('./routes/connectors');
const workspacesRouter = require('./routes/workspaces');
const maskingRouter = require('./routes/masking');
const webhooksRouter = require('./routes/webhooks');
const lineageRouter = require('./routes/lineage');
const annotationsRouter = require('./routes/annotations');
const automlRouter = require('./routes/automl');
const geoRouter = require('./routes/geo');
const pivotRouter = require('./routes/pivot');
const tfaRouter = require('./routes/tfa');
const pdfExportRouter = require('./routes/pdfExport');
const kaggleRouter = require('./routes/kaggle');
const githubRouter = require('./routes/github');
const tableauRouter = require('./routes/tableau');
const streamingRouter = require('./routes/streaming');
const knowledgeGraphRouter = require('./routes/knowledgeGraph');
const narrativesRouter = require('./routes/narratives');
const crmRouter = require('./routes/crm');
const vibeCodingRouter = require('./routes/vibeCoding');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('dev'));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/datasets', datasetRoutes);
app.use('/api/cleaning', cleaningRoutes);
app.use('/api/queries', queryRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/profiling', profilingRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/collaboration', collaborationRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/pipelines', pipelinesRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/business-questions', businessQuestionsRouter);
app.use('/api/external-api', externalApiRouter);
app.use('/api/syntax-helper', syntaxHelperRouter);
app.use('/api/nl-to-sql', nlToSqlRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/masking', maskingRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/lineage', lineageRouter);
app.use('/api/annotations', annotationsRouter);
app.use('/api/automl', automlRouter);
app.use('/api/geo', geoRouter);
app.use('/api/pivot', pivotRouter);
app.use('/api/tfa', tfaRouter);
app.use('/api/pdf', pdfExportRouter);
app.use('/api/kaggle', kaggleRouter);
app.use('/api/github', githubRouter);
app.use('/api/tableau', tableauRouter);
app.use('/api/streaming', streamingRouter);
app.use('/api/knowledge-graph', knowledgeGraphRouter);
app.use('/api/narratives', narrativesRouter);
app.use('/api/crm', crmRouter);
app.use('/api/vibe-coding', vibeCodingRouter);

// ── Inline routes for missing top-level resources ─────────────────────────────

const { authenticate } = require('./middleware/auth');
const pool = require('./db/pool');
const crypto = require('crypto');

// GET /api/users — list all users (admin team management)
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/alerts — list alerts for current user
app.get('/api/alerts', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.*, d.name as dataset_name FROM alerts a LEFT JOIN datasets d ON a.dataset_id=d.id WHERE a.created_by=$1 ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/alerts — create an alert
app.post('/api/alerts', authenticate, async (req, res) => {
  try {
    const { name, dataset_id, condition_sql, threshold_value, comparison_operator = '>', notification_channel = 'email', notification_config = {} } = req.body;
    if (!name || !dataset_id) return res.status(400).json({ error: 'name and dataset_id required' });
    const r = await pool.query(
      'INSERT INTO alerts (name, dataset_id, condition_sql, threshold_value, comparison_operator, notification_channel, notification_config, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, dataset_id, condition_sql || 'TRUE', threshold_value || null, comparison_operator, notification_channel, JSON.stringify(notification_config), req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/alerts/:id
app.delete('/api/alerts/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM alerts WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/api-keys — list API keys for current user
app.get('/api/api-keys', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, key_prefix, permissions, is_active, last_used_at, request_count, expires_at, created_at FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/api-keys — create an API key
app.post('/api/api-keys', authenticate, async (req, res) => {
  try {
    const { name, permissions = ['read'], expires_at } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const rawKey = `das_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);
    const r = await pool.query(
      'INSERT INTO api_keys (name, key_hash, key_prefix, user_id, permissions, expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, key_prefix, permissions, is_active, created_at',
      [name, keyHash, keyPrefix, req.user.id, JSON.stringify(permissions), expires_at || null]
    );
    res.status(201).json({ ...r.rows[0], key: rawKey, message: 'Store this key — it will not be shown again' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/api-keys/:id
app.delete('/api/api-keys/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE api_keys SET is_active=false WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'API key revoked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/cache/stats — query result cache statistics
app.get('/api/cache/stats', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT COUNT(*) as total_entries, SUM(hits) as total_hits FROM cache_entries').catch(() => ({ rows: [{ total_entries: 0, total_hits: 0 }] }));
    const stats = r.rows[0];
    res.json({
      totalEntries: parseInt(stats.total_entries) || 0,
      totalHits: parseInt(stats.total_hits) || 0,
      hitRate: stats.total_entries > 0 ? ((stats.total_hits / stats.total_entries) * 100).toFixed(1) + '%' : '0%',
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cache/clear
app.post('/api/cache/clear', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM cache_entries WHERE created_by=$1', [req.user.id]).catch(() => {});
    res.json({ message: 'Cache cleared' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aliases: /api/hubspot/* and /api/salesforce/* → /api/crm/hubspot/* and /api/crm/salesforce/*
// These re-prefix the path so the CRM router's /hubspot/* routes match correctly
app.use('/api/hubspot', (req, res, next) => {
  req.url = '/hubspot' + req.url;
  crmRouter(req, res, next);
});
app.use('/api/salesforce', (req, res, next) => {
  req.url = '/salesforce' + req.url;
  crmRouter(req, res, next);
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '3.0.0' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../../client/dist/index.html')));
}

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
module.exports = app;
