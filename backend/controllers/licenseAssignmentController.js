const SoftwareLicense = require('../models/SoftwareLicense');
const Asset = require('../models/Asset');
const asyncHandler = require('../utils/asyncHandler');
const { logAction } = require('../middleware/audit');

// Total seats in use = employees the license is assigned to + assets it's
// installed on, so both assignment types share the same seat pool.
function seatsInUse(license) {
  return (license.assignedTo?.length || 0) + (license.assignedAssets?.length || 0);
}

// @desc  Assign a software license to an asset (e.g. install Windows/Office
//        on a specific laptop). Enforces the license's seat limit.
// @route POST /api/software-licenses/:id/assign-asset  { assetId }
// @access Admin, Manager
exports.assignLicenseToAsset = asyncHandler(async (req, res) => {
  const { assetId } = req.body;
  if (!assetId) return res.status(400).json({ success: false, message: 'assetId is required.' });

  const license = await SoftwareLicense.findById(req.params.id);
  if (!license) return res.status(404).json({ success: false, message: 'Software license not found.' });

  const asset = await Asset.findById(assetId);
  if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });

  if (license.assignedAssets.some(a => String(a) === String(assetId))) {
    return res.status(400).json({ success: false, message: 'This license is already assigned to that asset.' });
  }

  if (seatsInUse(license) >= license.seatsTotal) {
    return res.status(400).json({ success: false, message: `No seats available - all ${license.seatsTotal} seat(s) of "${license.name}" are in use. Increase Total Seats or free one up first.` });
  }

  license.assignedAssets.push(assetId);
  license.seatsUsed = seatsInUse(license);
  await license.save();

  await logAction({ user: req.user._id, action: 'UPDATE', module: 'SoftwareLicense', recordId: license._id, details: { assignedAsset: assetId }, ip: req.ip });

  const populated = await SoftwareLicense.findById(license._id).populate('vendor assignedTo assignedAssets');
  res.json({ success: true, message: `"${license.name}" assigned to ${asset.assetTag} - ${asset.name}.`, data: populated });
});

// @desc  Remove a software license assignment from an asset
// @route POST /api/software-licenses/:id/unassign-asset  { assetId }
// @access Admin, Manager
exports.unassignLicenseFromAsset = asyncHandler(async (req, res) => {
  const { assetId } = req.body;
  if (!assetId) return res.status(400).json({ success: false, message: 'assetId is required.' });

  const license = await SoftwareLicense.findById(req.params.id);
  if (!license) return res.status(404).json({ success: false, message: 'Software license not found.' });

  license.assignedAssets = license.assignedAssets.filter(a => String(a) !== String(assetId));
  license.seatsUsed = seatsInUse(license);
  await license.save();

  await logAction({ user: req.user._id, action: 'UPDATE', module: 'SoftwareLicense', recordId: license._id, details: { unassignedAsset: assetId }, ip: req.ip });

  const populated = await SoftwareLicense.findById(license._id).populate('vendor assignedTo assignedAssets');
  res.json({ success: true, message: 'License unassigned from asset.', data: populated });
});
