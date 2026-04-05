const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const entryController = require('../controllers/entryController');

router.use(authenticate);

router.post('/', entryController.submitEntry);
router.post('/insight', aiLimiter, entryController.generateInsight);
router.get('/analytics', entryController.getAnalytics);
router.get('/', entryController.getEntries);
router.get('/:date', entryController.getEntryByDate);

module.exports = router;
