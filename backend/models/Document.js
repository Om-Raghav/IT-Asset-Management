const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  relatedModule: { type: String, required: true }, // e.g. 'Asset', 'Employee'
  relatedId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fileName: { type: String, required: true },
  originalName: { type: String },
  filePath: { type: String, required: true },
  fileType: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
