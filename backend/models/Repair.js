const mongoose = require('mongoose');

const repairSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  reportedByEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  issueDescription: { type: String, required: true, trim: true },
  reportedDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'], default: 'Pending' },
  cost: { type: Number, default: 0 },
  completedDate: { type: Date },
  remarks: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Repair', repairSchema);
