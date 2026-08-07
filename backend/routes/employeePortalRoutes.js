const express = require('express');
const router = express.Router();
const {
  getMyProfile, getMyAssets, getMyRepairs, reportIssue, requestReturn, getMyNotifications
} = require('../controllers/employeePortalController');
const { protect } = require('../middleware/auth');

// All routes here are scoped to the logged-in user's own linked Employee
// record - available to any authenticated role (Employee, Manager, Admin).
router.use(protect);
router.get('/profile', getMyProfile);
router.get('/assets', getMyAssets);
router.get('/repairs', getMyRepairs);
router.post('/report-issue', reportIssue);
router.post('/request-return', requestReturn);
router.get('/notifications', getMyNotifications);

module.exports = router;
