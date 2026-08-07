const express = require('express');
const router = express.Router();
const { getAssets, getAsset, createAsset, updateAsset, deleteAsset, generateAssetTag } = require('../controllers/assetController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/')
  .get(getAssets)
  .post(authorize('Admin', 'Manager'), createAsset);
router.get('/generate-tag', generateAssetTag);
router.route('/:id')
  .get(getAsset)
  .put(authorize('Admin', 'Manager'), updateAsset)
  .delete(authorize('Admin'), deleteAsset);

module.exports = router;
