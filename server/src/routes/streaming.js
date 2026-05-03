const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const mockGenerators = {
  sales: (i) => ({
    timestamp: new Date().toISOString(),
    revenue: parseFloat((5000 + Math.sin(i / 15) * 2000 + (Math.random() - 0.5) * 1000).toFixed(2)),
    orders: Math.floor(50 + Math.sin(i / 15) * 20 + Math.random() * 10),
    customers: Math.floor(30 + Math.sin(i / 20) * 10 + Math.random() * 5),
    avg_order_value: parseFloat((100 + (Math.random() - 0.5) * 30).toFixed(2)),
    returns: Math.floor(Math.random() * 5),
  }),
  stock: (i) => {
    const base = 150 + Math.sin(i / 10) * 20;
    const noise = (Math.random() - 0.5) * 5;
    return {
      timestamp: new Date().toISOString(),
      open: parseFloat((base + noise).toFixed(2)),
      high: parseFloat((base + Math.abs(noise) + Math.random() * 3).toFixed(2)),
      low: parseFloat((base - Math.abs(noise) - Math.random() * 3).toFixed(2)),
      close: parseFloat((base + (Math.random() - 0.5) * 4).toFixed(2)),
      volume: Math.floor(1000000 + Math.random() * 500000),
    };
  },
  iot: (i) => ({
    timestamp: new Date().toISOString(),
    temperature: parseFloat((25 + Math.sin(i / 30) * 5 + (Math.random() - 0.5) * 1).toFixed(2)),
    humidity: parseFloat((60 + Math.cos(i / 25) * 10 + (Math.random() - 0.5) * 2).toFixed(2)),
    pressure: parseFloat((1013 + (Math.random() - 0.5) * 5).toFixed(2)),
    cpu_usage: parseFloat((40 + Math.sin(i / 5) * 30 + Math.random() * 10).toFixed(1)),
    memory_mb: Math.floor(2048 + Math.random() * 1024),
  }),
  marketing: (i) => ({
    timestamp: new Date().toISOString(),
    impressions: Math.floor(10000 + Math.random() * 5000),
    clicks: Math.floor(500 + Math.random() * 200),
    conversions: Math.floor(50 + Math.random() * 30),
    ctr: parseFloat((2 + Math.random() * 1).toFixed(2)),
    spend: parseFloat((500 + Math.random() * 200).toFixed(2)),
  }),
  ecommerce: (i) => ({
    timestamp: new Date().toISOString(),
    page_views: Math.floor(5000 + Math.random() * 3000),
    sessions: Math.floor(2000 + Math.random() * 1000),
    bounce_rate: parseFloat((30 + (Math.random() - 0.5) * 10).toFixed(1)),
    cart_adds: Math.floor(300 + Math.random() * 100),
    checkouts: Math.floor(100 + Math.random() * 50),
    revenue: parseFloat((8000 + (Math.random() - 0.5) * 2000).toFixed(2)),
  }),
};

router.get('/feeds', authenticate, (req, res) => {
  res.json([
    { id: 'sales', label: 'Sales Dashboard', color: '#10b981', metrics: ['revenue', 'orders', 'customers', 'avg_order_value', 'returns'], primary: 'revenue', icon: '💰' },
    { id: 'stock', label: 'Stock Market Feed', color: '#6366f1', metrics: ['open', 'high', 'low', 'close', 'volume'], primary: 'close', icon: '📈' },
    { id: 'iot', label: 'IoT Sensors', color: '#f59e0b', metrics: ['temperature', 'humidity', 'pressure', 'co2', 'light'], primary: 'temperature', icon: '🌡️' },
    { id: 'marketing', label: 'Marketing', color: '#ec4899', metrics: ['impressions', 'clicks', 'conversions', 'cost', 'roas'], primary: 'conversions', icon: '📣' },
    { id: 'ecommerce', label: 'E-Commerce', color: '#8b5cf6', metrics: ['gmv', 'sessions', 'add_to_cart', 'purchases', 'refunds'], primary: 'gmv', icon: '🛒' },
  ]);
});

router.get('/types', authenticate, (req, res) => {
  res.json([
    { id: 'sales', label: 'Sales Dashboard', color: '#10b981', metrics: ['revenue', 'orders', 'customers', 'avg_order_value', 'returns'], primary: 'revenue', icon: '💰' },
    { id: 'stock', label: 'Stock Market Feed', color: '#6366f1', metrics: ['open', 'high', 'low', 'close', 'volume'], primary: 'close', icon: '📈' },
    { id: 'iot', label: 'IoT Sensor Stream', color: '#f59e0b', metrics: ['temperature', 'humidity', 'pressure', 'cpu_usage', 'memory_mb'], primary: 'temperature', icon: '🌡️' },
    { id: 'marketing', label: 'Marketing Analytics', color: '#ec4899', metrics: ['impressions', 'clicks', 'conversions', 'ctr', 'spend'], primary: 'impressions', icon: '📣' },
    { id: 'ecommerce', label: 'E-Commerce Live', color: '#8b5cf6', metrics: ['page_views', 'sessions', 'bounce_rate', 'cart_adds', 'revenue'], primary: 'revenue', icon: '🛒' },
  ]);
});

router.get('/sources', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM streaming_sources WHERE created_by=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sources', authenticate, async (req, res) => {
  try {
    const { name, type = 'mock', config = {} } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await pool.query(
      'INSERT INTO streaming_sources (name, type, config, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, type, JSON.stringify(config), req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sources/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM streaming_sources WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE feed endpoint — real-time mock data stream
router.get('/feed', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const feedType = req.query.type || 'sales';
  const intervalMs = Math.max(300, Math.min(5000, parseInt(req.query.interval) || 1000));
  const generator = mockGenerators[feedType] || mockGenerators.sales;
  let i = 0;

  res.write(`data: ${JSON.stringify({ type: 'connected', feedType, intervalMs, ts: Date.now() })}\n\n`);

  const timer = setInterval(() => {
    try {
      const point = generator(i++);
      res.write(`data: ${JSON.stringify({ ...point, _seq: i, _type: feedType })}\n\n`);
    } catch { clearInterval(timer); }
  }, intervalMs);

  req.on('close', () => clearInterval(timer));
  req.on('error', () => clearInterval(timer));
});

// Stream rows from an existing dataset (replay mode)
router.get('/feed/dataset/:id', authenticate, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const ds = await pool.query('SELECT * FROM datasets WHERE id=$1', [req.params.id]);
    if (!ds.rows.length) { res.write(`data: ${JSON.stringify({ error: 'Dataset not found' })}\n\n`); return res.end(); }

    const rows = await pool.query(`SELECT * FROM "data_${req.params.id}" ORDER BY row_index LIMIT 5000`);
    const data = rows.rows.map(r => { const { row_index, ...rest } = r; return rest; });
    const intervalMs = Math.max(100, parseInt(req.query.interval) || 400);
    const loop = req.query.loop === 'true';
    let i = 0;

    res.write(`data: ${JSON.stringify({ type: 'connected', dataset: ds.rows[0].name, total: data.length })}\n\n`);

    const timer = setInterval(() => {
      if (i >= data.length) {
        if (loop) { i = 0; } else {
          res.write(`data: ${JSON.stringify({ type: 'done', total: data.length })}\n\n`);
          clearInterval(timer); return;
        }
      }
      res.write(`data: ${JSON.stringify({ ...data[i], _seq: i, timestamp: new Date().toISOString() })}\n\n`);
      i++;
    }, intervalMs);

    req.on('close', () => clearInterval(timer));
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// Snapshot: latest data point without streaming
router.get('/snapshot', authenticate, (req, res) => {
  const feedType = req.query.type || 'sales';
  const gen = mockGenerators[feedType] || mockGenerators.sales;
  res.json(gen(Math.floor(Date.now() / 1000)));
});

module.exports = router;
