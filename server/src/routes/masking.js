const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const applyMask = (value, maskType, config = {}) => {
  if (value === null || value === undefined) return value;
  const v = String(value);
  switch (maskType) {
    case 'email': return v.replace(/^(.{2}).*(@.*)$/, '$1***$2');
    case 'phone': return v.replace(/\d(?=\d{4})/g, '*');
    case 'credit_card': return v.replace(/\d(?=\d{4})/g, '*');
    case 'name': return v.split(' ').map(w => w[0] + '***').join(' ');
    case 'partial': { const keep = config.keepChars || 3; return v.slice(0, keep) + '*'.repeat(Math.max(0, v.length - keep)); }
    case 'hash': { let h = 0; for (let i = 0; i < v.length; i++) h = Math.imul(31, h) + v.charCodeAt(i) | 0; return 'hash_' + Math.abs(h).toString(36); }
    case 'redact': return '[REDACTED]';
    case 'nullify': return null;
    case 'range': { const num = parseFloat(v); if (isNaN(num)) return v; const bucket = config.bucketSize || 10; return `${Math.floor(num/bucket)*bucket}-${Math.floor(num/bucket)*bucket+bucket}`; }
    default: return '[MASKED]';
  }
};

// POST / with dataset_id in body (alias for POST /:datasetId)
router.post('/', authenticate, async (req, res) => {
  const { dataset_id, column_name, mask_type, mask_config = {} } = req.body;
  if (!dataset_id) return res.status(400).json({ error: 'dataset_id required' });
  if (!column_name || !mask_type) return res.status(400).json({ error: 'column_name and mask_type required' });
  const validTypes = ['email','phone','credit_card','name','partial','hash','redact','nullify','range'];
  if (!validTypes.includes(mask_type)) return res.status(400).json({ error: `mask_type must be one of: ${validTypes.join(', ')}` });
  try {
    await pool.query('DELETE FROM masking_rules WHERE dataset_id=$1 AND column_name=$2', [dataset_id, column_name]);
    const r = await pool.query(
      'INSERT INTO masking_rules (dataset_id, column_name, mask_type, mask_config, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [dataset_id, column_name, mask_type, JSON.stringify(mask_config), req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/types', authenticate, (req, res) => {
  res.json([
    { type: 'email', label: 'Email Masking', example: 'jo***@example.com', description: 'Masks the username part of email addresses' },
    { type: 'phone', label: 'Phone Masking', example: '***-***-4567', description: 'Shows only last 4 digits' },
    { type: 'credit_card', label: 'Credit Card', example: '****-****-****-1234', description: 'Shows only last 4 digits' },
    { type: 'name', label: 'Name Masking', example: 'J*** D***', description: 'Shows only first letter of each name part' },
    { type: 'partial', label: 'Partial Reveal', example: 'abc***', description: 'Shows first N characters (configurable)' },
    { type: 'hash', label: 'Consistent Hash', example: 'hash_3x7f9', description: 'Deterministic hash — same value always maps to same hash' },
    { type: 'redact', label: 'Full Redaction', example: '[REDACTED]', description: 'Completely replaces value' },
    { type: 'nullify', label: 'Nullify', example: 'null', description: 'Replaces with null/empty' },
    { type: 'range', label: 'Numeric Range', example: '30-40', description: 'Replaces numbers with range buckets (configurable bucket size)' },
  ]);
});

router.get('/rules', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT mr.*, d.name as dataset_name FROM masking_rules mr
       LEFT JOIN datasets d ON mr.dataset_id = d.id
       ORDER BY mr.created_at DESC`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:datasetId', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM masking_rules WHERE dataset_id=$1 ORDER BY created_at', [req.params.datasetId]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:datasetId', authenticate, async (req, res) => {
  try {
    const { column_name, mask_type, mask_config = {} } = req.body;
    if (!column_name || !mask_type) return res.status(400).json({ error: 'column_name and mask_type required' });
    const validTypes = ['email','phone','credit_card','name','partial','hash','redact','nullify','range'];
    if (!validTypes.includes(mask_type)) return res.status(400).json({ error: `mask_type must be one of: ${validTypes.join(', ')}` });
    await pool.query('DELETE FROM masking_rules WHERE dataset_id=$1 AND column_name=$2', [req.params.datasetId, column_name]);
    const r = await pool.query('INSERT INTO masking_rules (dataset_id, column_name, mask_type, mask_config, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.params.datasetId, column_name, mask_type, JSON.stringify(mask_config), req.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:datasetId/preview', authenticate, async (req, res) => {
  try {
    const rules = await pool.query('SELECT * FROM masking_rules WHERE dataset_id=$1', [req.params.datasetId]);
    const data = await pool.query(`SELECT * FROM data_${req.params.datasetId} LIMIT 10`);
    const maskedRows = data.rows.map(row => {
      const masked = { ...row };
      for (const rule of rules.rows) {
        if (rule.column_name in masked) masked[rule.column_name] = applyMask(masked[rule.column_name], rule.mask_type, rule.mask_config);
      }
      return masked;
    });
    res.json({ original: data.rows, masked: maskedRows, rulesApplied: rules.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:datasetId/:ruleId', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM masking_rules WHERE id=$1 AND dataset_id=$2', [req.params.ruleId, req.params.datasetId]);
    res.json({ message: 'Rule deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
