const Asset = require('../models/Asset');
const AssetAssignment = require('../models/AssetAssignment');
const Repair = require('../models/Repair');
const SoftwareLicense = require('../models/SoftwareLicense');
const AMCContract = require('../models/AMCContract');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/reports/asset-inventory
exports.assetInventoryReport = asyncHandler(async (req, res) => {
  const assets = await Asset.find().populate('category vendor location').sort({ createdAt: -1 });
  res.json({ success: true, count: assets.length, data: assets });
});

// @route GET /api/reports/asset-utilization
exports.assetUtilizationReport = asyncHandler(async (req, res) => {
  const data = await Asset.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $project: { _id: 0, status: '$_id', count: 1 } }
  ]);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const withPercentage = data.map(d => ({ ...d, percentage: total ? Number(((d.count / total) * 100).toFixed(1)) : 0 }));
  res.json({ success: true, total, data: withPercentage });
});

// @route GET /api/reports/warranty-expiry
exports.warrantyExpiryReport = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 90;
  const future = new Date();
  future.setDate(future.getDate() + days);
  const assets = await Asset.find({ warrantyExpiry: { $lte: future } }).populate('category vendor').sort({ warrantyExpiry: 1 });
  res.json({ success: true, count: assets.length, data: assets });
});

// @route GET /api/reports/repair-history
exports.repairHistoryReport = asyncHandler(async (req, res) => {
  const repairs = await Repair.find().populate('asset vendor').sort({ reportedDate: -1 });
  res.json({ success: true, count: repairs.length, data: repairs });
});

// @route GET /api/reports/license-usage
exports.licenseUsageReport = asyncHandler(async (req, res) => {
  const licenses = await SoftwareLicense.find().populate('vendor assignedTo assignedAssets');
  const data = licenses.map(l => {
    const seatsUsed = l.assignedTo.length + l.assignedAssets.length;
    return {
      _id: l._id, name: l.name, seatsTotal: l.seatsTotal, seatsUsed,
      seatsAvailable: l.seatsTotal - seatsUsed, expiryDate: l.expiryDate, status: l.status
    };
  });
  res.json({ success: true, count: data.length, data });
});

// @route GET /api/reports/amc-status
exports.amcStatusReport = asyncHandler(async (req, res) => {
  const contracts = await AMCContract.find().populate('asset vendor').sort({ endDate: 1 });
  res.json({ success: true, count: contracts.length, data: contracts });
});

// @route GET /api/reports/assignment-history
exports.assignmentHistoryReport = asyncHandler(async (req, res) => {
  const assignments = await AssetAssignment.find().populate('asset employee assignedBy').sort({ createdAt: -1 });
  res.json({ success: true, count: assignments.length, data: assignments });
});
