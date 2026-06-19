const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db/pool');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');

const authenticate = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (apiKey && apiKey.startsWith('dap_')) {
      const result = await pool.query(
        `SELECT ak.*, u.id as user_id, u.name as user_name, u.email as user_email, u.role as user_role
         FROM api_keys ak JOIN users u ON ak.user_id=u.id
         WHERE ak.key_hash=$1 AND ak.is_active=true`,
        [crypto.createHash('sha256').update(apiKey).digest('hex')]
      );
      if (!result.rows.length) {
        return res.status(401).json({ error: 'Invalid or expired API key' });
      }
      const row = result.rows[0];
      req.user = {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        role: row.user_role || 'analyst',
      };
      req.apiKey = row;
      pool.query(
        'UPDATE api_keys SET last_used=NOW(), request_count=request_count+1 WHERE id=$1',
        [row.id]
      ).catch(() => {});
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, name, email, role, bio, avatar_color, email_verified FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { authenticate, authorize, JWT_SECRET };
