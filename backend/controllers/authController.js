const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const asyncHandler = require('../utils/asyncHandler');
const { logAction } = require('../middleware/audit');

// @desc  Register a new user (Admin only in production; open here for first-time setup)
// @route POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, roleName, employee } = req.body;

  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ success: false, message: 'User already exists' });

  const user = await User.create({ name, email, password, roleName: roleName || 'Employee', employee });

  await logAction({ user: user._id, action: 'CREATE', module: 'User', recordId: user._id, ip: req.ip });

  res.status(201).json({
    success: true,
    data: {
      _id: user._id, name: user.name, email: user.email, roleName: user.roleName,
      token: generateToken(user._id)
    }
  });
});

// @desc  Login user & return JWT
// @route POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account is deactivated' });
  }

  user.lastLogin = new Date();
  await user.save();

  await logAction({ user: user._id, action: 'LOGIN', module: 'Auth', recordId: user._id, ip: req.ip });

  res.json({
    success: true,
    data: {
      _id: user._id, name: user.name, email: user.email, roleName: user.roleName,
      token: generateToken(user._id)
    }
  });
});

// @desc  Get current logged-in user
// @route GET /api/auth/me
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

// @desc  Logged-in user changes their own password (Admin or Employee - any role)
// @route PUT /api/auth/change-password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Please provide your current and new password.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
  }

  const user = await User.findById(req.user._id).select('+password');
  const matches = await user.matchPassword(currentPassword);
  if (!matches) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
  }

  user.password = newPassword; // re-hashed automatically by the pre-save hook
  await user.save();

  await logAction({ user: user._id, action: 'UPDATE', module: 'User', recordId: user._id, details: { passwordChanged: true }, ip: req.ip });

  res.json({ success: true, message: 'Password changed successfully.' });
});
