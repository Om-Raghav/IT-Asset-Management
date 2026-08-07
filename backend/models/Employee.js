const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeCode: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  designation: { type: String, trim: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  dateOfJoining: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
