const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const reportController = require('../controllers/reportController');

router.use(authenticate);

router.get('/', reportController.getReports);
router.get('/:id', reportController.getReportById);
router.post('/generate', aiLimiter, reportController.generateReport);

module.exports = router;
