const asyncHandler = require('./asyncHandler');
const { logAction } = require('../middleware/audit');

/**
 * Generic CRUD controller factory for simple reference/master modules.
 * moduleName: string label used for audit logs
 * Model: mongoose model
 * populateFields: string|array passed to .populate()
 * searchFields: array of field names for basic text filtering via ?search=
 */
const crudFactory = (Model, moduleName, populateFields = '', searchFields = ['name']) => ({
  getAll: asyncHandler(async (req, res) => {
    const { search, page = 1, limit = 50, ...filters } = req.query;
    let query = { ...filters };

    if (search) {
      query.$or = searchFields.map(field => ({ [field]: { $regex: search, $options: 'i' } }));
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Model.find(query).populate(populateFields).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Model.countDocuments(query)
    ]);

    res.json({ success: true, count: items.length, total, page: Number(page), data: items });
  }),

  getOne: asyncHandler(async (req, res) => {
    const item = await Model.findById(req.params.id).populate(populateFields);
    if (!item) return res.status(404).json({ success: false, message: `${moduleName} not found` });
    res.json({ success: true, data: item });
  }),

  create: asyncHandler(async (req, res) => {
    const item = await Model.create(req.body);
    await logAction({ user: req.user?._id, action: 'CREATE', module: moduleName, recordId: item._id, details: req.body, ip: req.ip });
    res.status(201).json({ success: true, data: item });
  }),

  update: asyncHandler(async (req, res) => {
    const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: `${moduleName} not found` });
    await logAction({ user: req.user?._id, action: 'UPDATE', module: moduleName, recordId: item._id, details: req.body, ip: req.ip });
    res.json({ success: true, data: item });
  }),

  remove: asyncHandler(async (req, res) => {
    const item = await Model.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: `${moduleName} not found` });
    await logAction({ user: req.user?._id, action: 'DELETE', module: moduleName, recordId: item._id, ip: req.ip });
    res.json({ success: true, message: `${moduleName} deleted`, data: item });
  })
});

module.exports = crudFactory;
