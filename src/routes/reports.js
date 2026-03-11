const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.use(authenticate);

router.get('/status', reportController.getStatus);
router.get('/', reportController.getReports);
router.get('/:id', reportController.getReportById);

module.exports = router;
