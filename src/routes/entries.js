const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const entryController = require('../controllers/entryController');

router.use(authenticate);

router.post('/', entryController.submitEntry);
router.get('/', entryController.getEntries);
router.get('/:date', entryController.getEntryByDate);

module.exports = router;
