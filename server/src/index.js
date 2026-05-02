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
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('dev'));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/datasets', datasetRoutes);
app.use('/api/cleaning', cleaningRoutes);
app.use('/api/queries', queryRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../../client/dist/index.html')));
}

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
module.exports = app;
