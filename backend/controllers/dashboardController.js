const Asset = require('../models/Asset');
const Employee = require('../models/Employee');
const AssetAssignment = require('../models/AssetAssignment');
const Repair = require('../models/Repair');
const SoftwareLicense = require('../models/SoftwareLicense');
const AMCContract = require('../models/AMCContract');
const Vendor = require('../models/Vendor');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/dashboard/summary
exports.getSummary = asyncHandler(async (req, res) => {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [
    totalAssets, availableAssets, assignedAssets, inRepairAssets, retiredAssets,
    totalEmployees, activeAssignments, pendingRepairs, totalVendors,
    expiringWarranties, expiringLicenses, expiringAMCs
  ] = await Promise.all([
    Asset.countDocuments(),
    Asset.countDocuments({ status: 'Available' }),
    Asset.countDocuments({ status: 'Assigned' }),
    Asset.countDocuments({ status: 'In Repair' }),
    Asset.countDocuments({ status: { $in: ['Retired', 'Scrapped'] } }),
    Employee.countDocuments({ status: 'Active' }),
    AssetAssignment.countDocuments({ status: 'Active' }),
    Repair.countDocuments({ status: { $in: ['Pending', 'In Progress'] } }),
    Vendor.countDocuments(),
    Asset.countDocuments({ warrantyExpiry: { $lte: thirtyDaysFromNow, $gte: new Date() } }),
    SoftwareLicense.countDocuments({ expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() } }),
    AMCContract.countDocuments({ endDate: { $lte: thirtyDaysFromNow, $gte: new Date() } })
  ]);

  const assetsByCategory = await Asset.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $lookup: { from: 'assetcategories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, category: '$category.name', count: 1 } }
  ]);

  const assetsByStatus = await Asset.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $project: { _id: 0, status: '$_id', count: 1 } }
  ]);

  res.json({
    success: true,
    data: {
      totalAssets, availableAssets, assignedAssets, inRepairAssets, retiredAssets,
      totalEmployees, activeAssignments, pendingRepairs, totalVendors,
      expiringWarranties, expiringLicenses, expiringAMCs,
      assetsByCategory, assetsByStatus
    }
  });
});
