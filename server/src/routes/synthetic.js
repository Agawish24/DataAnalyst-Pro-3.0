const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { pyPost } = require('../utils/pythonClient');

const router = express.Router();

router.get('/templates', authenticate, async (req, res) => {
  try {
    const pyRes = await pyPost('/synthetic/templates', {}, { timeout: 10000 }).catch(() => null);
    if (pyRes?.data) return res.json(pyRes.data);
    res.json([
      { id: 'sales', name: 'Sales Data', description: '12 columns: date, region, product, channel, revenue, profit', columns: 12 },
      { id: 'hr', name: 'HR Analytics', description: '9 columns: department, gender, salary, performance, attrition', columns: 9 },
      { id: 'iot', name: 'IoT Telemetry', description: '8 columns: sensor_id, temperature, humidity, pressure, alerts', columns: 8 },
      { id: 'ecommerce', name: 'E-Commerce Orders', description: '9 columns: segment, category, order_value, rating, returns', columns: 9 },
      { id: 'finance', name: 'Financial OHLCV', description: '8 columns: symbol, open, high, low, close, volume', columns: 8 },
    ]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/generate', authenticate, async (req, res) => {
  try {
    const { schema, n_rows = 100, template, seed = 42 } = req.body;
    if (!schema?.length && !template) return res.status(400).json({ error: 'Provide schema or template' });
    const pyRes = await pyPost('/synthetic/generate', { schema, n_rows, template, seed }, { timeout: 60000 });
    res.json(pyRes.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Python ML service unavailable' });
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

router.post('/save', authenticate, async (req, res) => {
  try {
    const { name, rows, schema, description = '' } = req.body;
    if (!name || !rows?.length) return res.status(400).json({ error: 'name and rows required' });

    const schemaArr = schema || Object.keys(rows[0]).map(k => ({ name: k, type: 'text' }));

    const dsResult = await pool.query(
      `INSERT INTO datasets (name, description, row_count, column_count, schema, source, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,'synthetic',$6) RETURNING *`,
      [name, description || `Synthetic: ${name}`, rows.length, schemaArr.length,
       JSON.stringify(schemaArr), req.user.id]
    );
    const ds = dsResult.rows[0];

    const colDefs = schemaArr.map(c => {
      const t = c.type === 'integer' ? 'NUMERIC'
              : c.type === 'float' ? 'NUMERIC'
              : c.type === 'boolean' ? 'BOOLEAN'
              : 'TEXT';
      return `"${c.name}" ${t}`;
    }).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS data_${ds.id} (row_index SERIAL PRIMARY KEY, ${colDefs})`);

    const colNames = schemaArr.map(c => `"${c.name}"`).join(', ');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const placeholders = batch.map((_, bi) =>
          '(' + schemaArr.map((__, ci) => `$${bi * schemaArr.length + ci + 1}`).join(',') + ')'
        ).join(',');
        const vals = batch.flatMap(r => schemaArr.map(c => r[c.name] ?? null));
        await client.query(`INSERT INTO data_${ds.id} (${colNames}) VALUES ${placeholders}`, vals);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json({ dataset: ds, message: `Saved ${rows.length} rows as "${name}"` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
