const AssetAssignment = require('../models/AssetAssignment');
const AssetReturn = require('../models/AssetReturn');
const Asset = require('../models/Asset');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { logAction } = require('../middleware/audit');

// @desc Allocate an asset to an employee
// @route POST /api/assignments
exports.allocateAsset = asyncHandler(async (req, res) => {
  const { asset, employee, expectedReturnDate, remarks } = req.body;

  const assetDoc = await Asset.findById(asset);
  if (!assetDoc) return res.status(404).json({ success: false, message: 'Asset not found' });
  if (assetDoc.status !== 'Available') {
    return res.status(400).json({ success: false, message: `Asset is currently '${assetDoc.status}' and cannot be assigned` });
  }

  const assignment = await AssetAssignment.create({
    asset, employee, expectedReturnDate, remarks, assignedBy: req.user?._id
  });

  assetDoc.status = 'Assigned';
  await assetDoc.save();

  await Notification.create({
    title: 'Asset Assigned',
    message: `Asset ${assetDoc.assetTag} - ${assetDoc.name} has been assigned.`,
    type: 'Info'
  });

  await logAction({ user: req.user?._id, action: 'CREATE', module: 'AssetAssignment', recordId: assignment._id, details: req.body, ip: req.ip });

  const populated = await assignment.populate('asset employee');
  res.status(201).json({ success: true, data: populated });
});

// @route GET /api/assignments
exports.getAssignments = asyncHandler(async (req, res) => {
  const { status, employee, asset, page = 1, limit = 50 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (employee) query.employee = employee;
  if (asset) query.asset = asset;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    AssetAssignment.find(query).populate('asset employee assignedBy').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    AssetAssignment.countDocuments(query)
  ]);
  res.json({ success: true, count: items.length, total, page: Number(page), data: items });
});

// @route GET /api/assignments/:id
exports.getAssignment = asyncHandler(async (req, res) => {
  const item = await AssetAssignment.findById(req.params.id).populate('asset employee assignedBy');
  if (!item) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true, data: item });
});

// @desc Process a return for an active assignment
// @route POST /api/returns
exports.returnAsset = asyncHandler(async (req, res) => {
  const { assignment, condition, remarks } = req.body;

  const assignmentDoc = await AssetAssignment.findById(assignment);
  if (!assignmentDoc) return res.status(404).json({ success: false, message: 'Assignment not found' });
  if (assignmentDoc.status === 'Returned') {
    return res.status(400).json({ success: false, message: 'This assignment has already been returned' });
  }

  const assetReturn = await AssetReturn.create({
    assignment: assignmentDoc._id,
    asset: assignmentDoc.asset,
    employee: assignmentDoc.employee,
    condition,
    remarks,
    receivedBy: req.user?._id
  });

  assignmentDoc.status = 'Returned';
  assignmentDoc.actualReturnDate = new Date();
  await assignmentDoc.save();

  const assetDoc = await Asset.findById(assignmentDoc.asset);
  if (assetDoc) {
    assetDoc.status = condition === 'Damaged' ? 'In Repair' : 'Available';
    assetDoc.condition = condition === 'Damaged' ? 'Poor' : (condition || assetDoc.condition);
    await assetDoc.save();
  }

  await logAction({ user: req.user?._id, action: 'CREATE', module: 'AssetReturn', recordId: assetReturn._id, details: req.body, ip: req.ip });

  const populated = await assetReturn.populate('asset employee assignment');
  res.status(201).json({ success: true, data: populated });
});

// @route GET /api/returns
exports.getReturns = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    AssetReturn.find().populate('asset employee assignment receivedBy').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    AssetReturn.countDocuments()
  ]);
  res.json({ success: true, count: items.length, total, page: Number(page), data: items });
});
