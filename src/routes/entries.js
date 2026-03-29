const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { entryLimiter, insightLimiter } = require('../middleware/rateLimiter');
const entryController = require('../controllers/entryController');

router.use(authenticate);

router.post('/', entryLimiter, entryController.submitEntry);
router.post('/insight', insightLimiter, entryController.generateInsight);
router.get('/', entryController.getEntries);
router.get('/:date', entryController.getEntryByDate);

module.exports = router;
