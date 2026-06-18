const pool = require('../db/pool');

/**
 * Log a user action to audit_logs.
 * Call fire-and-forget (no await needed) so it never blocks a response.
 * @param {object} opts
 * @param {number} opts.userId
 * @param {string} opts.action       e.g. 'login', 'upload_dataset', 'run_query', 'export_csv', 'delete_dataset'
 * @param {string} opts.resourceType e.g. 'dataset', 'query', 'report', 'user'
 * @param {number|string|null} opts.resourceId
 * @param {object} opts.meta         extra JSON metadata
 * @param {string} opts.ipAddress
 */
async function logAction({ userId, action, resourceType = 'system', resourceId = null, meta = {}, ipAddress = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, action, resourceType, resourceId ? String(resourceId) : null, JSON.stringify(meta), ipAddress]
    );
  } catch (_) {
    // Audit log failures must never crash the main request
  }
}

module.exports = { logAction };
