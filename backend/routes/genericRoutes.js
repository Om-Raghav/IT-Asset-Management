// Builds an express router for a generic CRUD module
const express = require('express');
const { protect, authorize } = require('../middleware/auth');

const buildGenericRouter = (controller, adminOnlyWrite = false) => {
  const router = express.Router();
  const writeGuard = adminOnlyWrite ? authorize('Admin') : authorize('Admin', 'Manager');

  router.use(protect);
  router.route('/')
    .get(controller.getAll)
    .post(writeGuard, controller.create);
  router.route('/:id')
    .get(controller.getOne)
    .put(writeGuard, controller.update)
    .delete(authorize('Admin'), controller.remove);

  return router;
};

module.exports = buildGenericRouter;
