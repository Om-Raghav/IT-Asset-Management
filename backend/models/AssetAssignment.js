const mongoose = require('mongoose');

const assetAssignmentSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  assignedDate: { type: Date, default: Date.now },
  expectedReturnDate: { type: Date },
  actualReturnDate: { type: Date },
  status: { type: String, enum: ['Active', 'Returned'], default: 'Active' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  remarks: { type: String, trim: true },
  returnRequested: { type: Boolean, default: false },
  returnRequestedDate: { type: Date },
  returnRequestRemarks: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('AssetAssignment', assetAssignmentSchema);
