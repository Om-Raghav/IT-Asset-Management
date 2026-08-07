const AuditLog = require('../models/AuditLog');

// Attach an audit log entry. Call inside controllers after a successful mutation.
const logAction = async ({ user, action, module, recordId, details, ip }) => {
  try {
    await AuditLog.create({
      user: user || null,
      action,
      module,
      recordId: recordId || null,
      details: details || {},
      ipAddress: ip || ''
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { logAction };
