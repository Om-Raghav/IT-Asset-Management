const express = require('express');
const router = express.Router();
const { returnAsset, getReturns } = require('../controllers/assignmentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/')
  .get(getReturns)
  .post(authorize('Admin', 'Manager'), returnAsset);

module.exports = router;
