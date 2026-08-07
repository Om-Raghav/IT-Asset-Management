const express = require('express');
const router = express.Router();
const { allocateAsset, getAssignments, getAssignment } = require('../controllers/assignmentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/')
  .get(getAssignments)
  .post(authorize('Admin', 'Manager'), allocateAsset);
router.get('/:id', getAssignment);

module.exports = router;
