const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');
const AssetCategory = require('../models/AssetCategory');
const asyncHandler = require('../utils/asyncHandler');
const { logAction } = require('../middleware/audit');

// @desc  Generates the next available asset tag from a vendor + category,
//        e.g. Vendor "Dell Technologies" + Category "Laptop" -> "DEL-LAP-0001".
//        Looks at existing tags matching that same prefix and picks the next
//        free sequence number, so it stays unique even after deletions.
// @route GET /api/assets/generate-tag?vendorId=...&categoryId=...
exports.generateAssetTag = asyncHandler(async (req, res) => {
  const { vendorId, categoryId } = req.query;
  if (!vendorId || !categoryId) {
    return res.status(400).json({ success: false, message: 'vendorId and categoryId are both required to generate a tag.' });
  }

  const [vendor, category] = await Promise.all([
    Vendor.findById(vendorId),
    AssetCategory.findById(categoryId)
  ]);
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
  if (!category) return res.status(404).json({ success: false, message: 'Asset category not found.' });

  const clean = (s) => (s || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const vendorCode = clean(vendor.name).slice(0, 3) || 'VEN';
  const categoryCode = clean(category.name).slice(0, 3) || 'CAT';
  const prefix = `${vendorCode}-${categoryCode}-`;

  const existing = await Asset.find({ assetTag: { $regex: `^${prefix}\\d+$` } }).select('assetTag');
  let maxNum = 0;
  existing.forEach(a => {
    const n = parseInt(a.assetTag.slice(prefix.length), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  const assetTag = `${prefix}${String(maxNum + 1).padStart(4, '0')}`;

  res.json({ success: true, data: { assetTag, prefix, vendorCode, categoryCode } });
});

// @route GET /api/assets
exports.getAssets = asyncHandler(async (req, res) => {
  const { search, category, status, vendor, location, page = 1, limit = 50 } = req.query;
  const query = {};

  if (category) query.category = category;
  if (status) query.status = status;
  if (vendor) query.vendor = vendor;
  if (location) query.location = location;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { assetTag: { $regex: search, $options: 'i' } },
      { serialNumber: { $regex: search, $options: 'i' } },
      { brand: { $regex: search, $options: 'i' } },
      { model: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Asset.find(query).populate('category vendor location').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Asset.countDocuments(query)
  ]);

  res.json({ success: true, count: items.length, total, page: Number(page), data: items });
});

// @route GET /api/assets/:id
exports.getAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.params.id).populate('category vendor location');
  if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
  res.json({ success: true, data: asset });
});

// @route POST /api/assets
exports.createAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.create(req.body);
  await logAction({ user: req.user?._id, action: 'CREATE', module: 'Asset', recordId: asset._id, details: req.body, ip: req.ip });
  res.status(201).json({ success: true, data: asset });
});

// @route PUT /api/assets/:id
exports.updateAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
  await logAction({ user: req.user?._id, action: 'UPDATE', module: 'Asset', recordId: asset._id, details: req.body, ip: req.ip });
  res.json({ success: true, data: asset });
});

// @route DELETE /api/assets/:id
exports.deleteAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.findByIdAndDelete(req.params.id);
  if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
  await logAction({ user: req.user?._id, action: 'DELETE', module: 'Asset', recordId: asset._id, ip: req.ip });
  res.json({ success: true, message: 'Asset deleted', data: asset });
});
