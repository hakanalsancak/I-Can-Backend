const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

router.use(authenticate);

router.get('/status', subscriptionController.getStatus);
router.post('/verify', subscriptionController.verifyReceipt);

module.exports = router;
