const express = require('express');
const router = express.Router();
const {
  naturalLanguageSearch, chatAssistant, chatAssistantStream, warrantyExpiryPrediction,
  duplicateDetection, assetHealthPrediction, smartSummary, runComplianceChecksNow
} = require('../controllers/aiController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.get('/search', naturalLanguageSearch);
router.post('/chat', chatAssistant);
router.post('/chat/stream', chatAssistantStream);
router.get('/warranty-prediction', warrantyExpiryPrediction);
router.get('/duplicate-detection', duplicateDetection);
router.get('/health-prediction', assetHealthPrediction);
router.get('/smart-summary', smartSummary);
router.post('/run-compliance-checks', authorize('Admin'), runComplianceChecksNow);

module.exports = router;
