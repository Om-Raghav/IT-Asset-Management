/**
 * Self-service endpoints for the logged-in user's own linked Employee
 * record. Scoped strictly to req.user - an employee can only ever see
 * or act on their own assets/repairs/notifications, never anyone else's.
 */
const Employee = require('../models/Employee');
const AssetAssignment = require('../models/AssetAssignment');
const Repair = require('../models/Repair');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { logAction } = require('../middleware/audit');

// Resolves the Employee document linked to the logged-in user, or null.
async function getLinkedEmployee(req) {
  if (!req.user.employee) return null;
  return Employee.findById(req.user.employee).populate('department location');
}

// @route GET /api/me/profile
exports.getMyProfile = asyncHandler(async (req, res) => {
  const employee = await getLinkedEmployee(req);
  if (!employee) {
    return res.status(404).json({ success: false, message: 'No employee record is linked to your account. Contact an administrator.' });
  }
  res.json({ success: true, data: employee });
});

// @route GET /api/me/assets
exports.getMyAssets = asyncHandler(async (req, res) => {
  const employee = await getLinkedEmployee(req);
  if (!employee) return res.json({ success: true, count: 0, data: [] });

  const assignments = await AssetAssignment.find({ employee: employee._id, status: 'Active' })
    .populate({ path: 'asset', populate: ['category', 'vendor', 'location'] })
    .sort({ assignedDate: -1 });

  res.json({ success: true, count: assignments.length, data: assignments });
});

// @route GET /api/me/repairs
exports.getMyRepairs = asyncHandler(async (req, res) => {
  const employee = await getLinkedEmployee(req);
  if (!employee) return res.json({ success: true, count: 0, data: [] });

  const repairs = await Repair.find({ reportedByEmployee: employee._id })
    .populate('asset vendor')
    .sort({ reportedDate: -1 });

  res.json({ success: true, count: repairs.length, data: repairs });
});

// @desc Employee reports an issue with one of their own assigned assets
// @route POST /api/me/report-issue  { assignmentId, issueDescription }
exports.reportIssue = asyncHandler(async (req, res) => {
  const employee = await getLinkedEmployee(req);
  if (!employee) return res.status(404).json({ success: false, message: 'No employee record linked to your account.' });

  const { assignmentId, issueDescription } = req.body;
  if (!issueDescription || !issueDescription.trim()) {
    return res.status(400).json({ success: false, message: 'Please describe the issue.' });
  }

  const assignment = await AssetAssignment.findById(assignmentId);
  if (!assignment || String(assignment.employee) !== String(employee._id) || assignment.status !== 'Active') {
    return res.status(403).json({ success: false, message: 'You can only report issues for assets currently assigned to you.' });
  }

  const repair = await Repair.create({
    asset: assignment.asset,
    reportedByEmployee: employee._id,
    issueDescription: issueDescription.trim(),
    status: 'Pending'
  });

  await logAction({ user: req.user._id, action: 'CREATE', module: 'Repair', recordId: repair._id, details: { selfReported: true }, ip: req.ip });

  const populated = await repair.populate('asset');
  res.status(201).json({ success: true, message: 'Issue reported. IT will follow up shortly.', data: populated });
});

// @desc Employee requests to return one of their own assigned assets
// @route POST /api/me/request-return  { assignmentId, remarks }
exports.requestReturn = asyncHandler(async (req, res) => {
  const employee = await getLinkedEmployee(req);
  if (!employee) return res.status(404).json({ success: false, message: 'No employee record linked to your account.' });

  const { assignmentId, remarks } = req.body;
  const assignment = await AssetAssignment.findById(assignmentId);
  if (!assignment || String(assignment.employee) !== String(employee._id) || assignment.status !== 'Active') {
    return res.status(403).json({ success: false, message: 'You can only request a return for assets currently assigned to you.' });
  }
  if (assignment.returnRequested) {
    return res.status(400).json({ success: false, message: 'A return has already been requested for this asset.' });
  }

  assignment.returnRequested = true;
  assignment.returnRequestedDate = new Date();
  assignment.returnRequestRemarks = remarks || '';
  await assignment.save();

  await logAction({ user: req.user._id, action: 'UPDATE', module: 'AssetAssignment', recordId: assignment._id, details: { returnRequested: true }, ip: req.ip });

  const populated = await assignment.populate('asset');
  res.json({ success: true, message: 'Return request submitted. IT will process it soon.', data: populated });
});

// @route GET /api/me/notifications
exports.getMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, count: notifications.length, data: notifications });
});
