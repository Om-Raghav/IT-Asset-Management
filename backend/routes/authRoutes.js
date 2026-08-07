const express = require('express');
const router = express.Router();
const { register, login, getMe, changePassword } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

// Registration is Admin-only now that `npm run seed` always creates an
// initial Admin account - open self-registration would let anyone create
// an account with any role. Use the Employees page "Create Login" flow
// (POST /api/employees/:id/create-login) to give an existing employee a
// login instead.
router.post('/register', protect, authorize('Admin'), register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

module.exports = router;
