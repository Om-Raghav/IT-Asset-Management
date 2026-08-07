const crypto = require('crypto');
const User = require('../models/User');
const Employee = require('../models/Employee');
const asyncHandler = require('../utils/asyncHandler');
const { logAction } = require('../middleware/audit');

function generateTempPassword() {
  // 10-char readable-ish random password, e.g. "aF3kQ9zP2m"
  return crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
}

// @desc  Admin creates a login for an existing employee record.
//        Defaults email to the employee's own email and generates a
//        temporary password if none is supplied, so it can be shared
//        with the employee once (it is never stored or shown again).
// @route POST /api/employees/:id/create-login
// @access Admin only
exports.createLoginForEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

  const existingByEmployee = await User.findOne({ employee: employee._id });
  if (existingByEmployee) {
    return res.status(400).json({ success: false, message: `This employee already has a login (${existingByEmployee.email}).` });
  }

  const email = (req.body.email || employee.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ success: false, message: 'Employee has no email on file - provide one to create a login.' });
  }

  const existingByEmail = await User.findOne({ email });
  if (existingByEmail) {
    return res.status(400).json({ success: false, message: `A login already exists with email ${email}.` });
  }

  const roleName = ['Admin', 'Manager', 'Employee'].includes(req.body.roleName) ? req.body.roleName : 'Employee';
  const password = (req.body.password && req.body.password.length >= 6) ? req.body.password : generateTempPassword();

  const user = await User.create({
    name: employee.name,
    email,
    password,
    roleName,
    employee: employee._id
  });

  await logAction({ user: req.user._id, action: 'CREATE', module: 'User', recordId: user._id, details: { employee: employee._id, roleName }, ip: req.ip });

  // Password is returned once, in plaintext, so the Admin can share it with
  // the employee - it is not recoverable afterward (only hashed in the DB).
  res.status(201).json({
    success: true,
    message: 'Login created successfully. Share these credentials with the employee - they will not be shown again.',
    data: { _id: user._id, name: user.name, email: user.email, roleName: user.roleName, temporaryPassword: password }
  });
});

// @desc  Admin resets the password for an employee who already has a login
//        (e.g. they forgot it). Sets a new password immediately - no email
//        or reset link involved, since this project has no mail sending.
//        Generates a temporary password if none is supplied, shown once so
//        the Admin can hand it to the employee.
// @route POST /api/employees/:id/reset-password
// @access Admin only
exports.resetPasswordForEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

  const user = await User.findOne({ employee: employee._id }).select('+password');
  if (!user) {
    return res.status(404).json({ success: false, message: 'This employee has no login yet - use Create Login instead.' });
  }

  const password = (req.body.password && req.body.password.length >= 6) ? req.body.password : generateTempPassword();
  user.password = password; // re-hashed automatically by the pre-save hook
  await user.save();

  await logAction({ user: req.user._id, action: 'UPDATE', module: 'User', recordId: user._id, details: { passwordReset: true, targetEmployee: employee._id }, ip: req.ip });

  res.json({
    success: true,
    message: 'Password reset successfully. Share the new password with the employee - it will not be shown again.',
    data: { _id: user._id, name: user.name, email: user.email, roleName: user.roleName, temporaryPassword: password }
  });
});
