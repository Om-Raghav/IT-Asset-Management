const Document = require('../models/Document');
const asyncHandler = require('../utils/asyncHandler');

// @route POST /api/documents/upload
exports.uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const { relatedModule, relatedId } = req.body;
  const doc = await Document.create({
    relatedModule, relatedId,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    filePath: `/uploads/${req.file.filename}`,
    fileType: req.file.mimetype,
    uploadedBy: req.user?._id
  });

  res.status(201).json({ success: true, data: doc });
});

// @route GET /api/documents?relatedModule=Asset&relatedId=...
exports.getDocuments = asyncHandler(async (req, res) => {
  const { relatedModule, relatedId } = req.query;
  const query = {};
  if (relatedModule) query.relatedModule = relatedModule;
  if (relatedId) query.relatedId = relatedId;
  const docs = await Document.find(query).populate('uploadedBy', 'name email').sort({ createdAt: -1 });
  res.json({ success: true, count: docs.length, data: docs });
});

// @route DELETE /api/documents/:id
exports.deleteDocument = asyncHandler(async (req, res) => {
  const doc = await Document.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  res.json({ success: true, message: 'Document deleted' });
});
