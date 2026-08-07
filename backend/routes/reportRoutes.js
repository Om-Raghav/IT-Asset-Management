const express = require('express');
const router = express.Router();
const {
  assetInventoryReport, assetUtilizationReport, warrantyExpiryReport,
  repairHistoryReport, licenseUsageReport, amcStatusReport, assignmentHistoryReport
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/asset-inventory', assetInventoryReport);
router.get('/asset-utilization', assetUtilizationReport);
router.get('/warranty-expiry', warrantyExpiryReport);
router.get('/repair-history', repairHistoryReport);
router.get('/license-usage', licenseUsageReport);
router.get('/amc-status', amcStatusReport);
router.get('/assignment-history', assignmentHistoryReport);

module.exports = router;
