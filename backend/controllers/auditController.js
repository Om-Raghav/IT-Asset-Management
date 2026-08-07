const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/audit-logs
exports.getAuditLogs = asyncHandler(async (req, res) => {
  const { module, action, user, page = 1, limit = 100 } = req.query;
  const query = {};
  if (module) query.module = module;
  if (action) query.action = action;
  if (user) query.user = user;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    AuditLog.find(query).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    AuditLog.countDocuments(query)
  ]);
  res.json({ success: true, count: items.length, total, page: Number(page), data: items });
});
