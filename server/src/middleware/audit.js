const pool = require('../db/pool');

const auditLog = (action, resourceType = null) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (res.statusCode < 400 && req.user) {
      const resourceId = req.params.id ? parseInt(req.params.id) : (data?.id || null);
      pool.query(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.user.id, action, resourceType, resourceId,
         JSON.stringify({ method: req.method, path: req.path, body: req.body }),
         req.ip || req.connection?.remoteAddress,
         req.headers['user-agent']]
      ).catch(() => {});
    }
    return originalJson(data);
  };
  next();
};

module.exports = { auditLog };
