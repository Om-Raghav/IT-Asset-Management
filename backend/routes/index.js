const express = require('express');
const router = express.Router();

const buildGenericRouter = require('./genericRoutes');
const generic = require('../controllers/genericControllers');
const { protect, authorize } = require('../middleware/auth');
const { createLoginForEmployee, resetPasswordForEmployee } = require('../controllers/employeeLoginController');
const { assignLicenseToAsset, unassignLicenseFromAsset } = require('../controllers/licenseAssignmentController');

router.use('/auth', require('./authRoutes'));
router.use('/me', require('./employeePortalRoutes'));
router.use('/assets', require('./assetRoutes'));
router.use('/assignments', require('./assignmentRoutes'));
router.use('/returns', require('./returnRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/reports', require('./reportRoutes'));
router.use('/ai', require('./aiRoutes'));
router.use('/audit-logs', require('./auditRoutes'));
router.use('/documents', require('./documentRoutes'));

// Admin: create a login, or reset the password of an existing one, for an
// employee record. Mounted before the generic /employees router below;
// distinct paths so they never collide with the generic router's own routes.
router.post('/employees/:id/create-login', protect, authorize('Admin'), createLoginForEmployee);
router.post('/employees/:id/reset-password', protect, authorize('Admin'), resetPasswordForEmployee);

// Assign/unassign a software license to a specific asset (e.g. a laptop).
// Mounted before the generic /software-licenses router for the same reason.
router.post('/software-licenses/:id/assign-asset', protect, authorize('Admin', 'Manager'), assignLicenseToAsset);
router.post('/software-licenses/:id/unassign-asset', protect, authorize('Admin', 'Manager'), unassignLicenseFromAsset);

// Master / reference data modules (generic CRUD)
router.use('/departments', buildGenericRouter(generic.department));
router.use('/locations', buildGenericRouter(generic.location));
router.use('/employees', buildGenericRouter(generic.employee));
router.use('/vendors', buildGenericRouter(generic.vendor));
router.use('/asset-categories', buildGenericRouter(generic.assetCategory));
router.use('/software-licenses', buildGenericRouter(generic.softwareLicense));
router.use('/amc-contracts', buildGenericRouter(generic.amcContract));
router.use('/repairs', buildGenericRouter(generic.repair));
router.use('/notifications', buildGenericRouter(generic.notification));
router.use('/settings', buildGenericRouter(generic.settings, true));
router.use('/roles', buildGenericRouter(generic.role, true));
router.use('/permissions', buildGenericRouter(generic.permission, true));

module.exports = router;
