const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');
const subscriptionController = require('../controllers/subscriptionController');

// Apple Server-to-Server Notification V2 (no auth — called by Apple directly)
// Apple S2S payloads are small JWS strings — 256 KB is generous
router.post('/apple-notification', webhookLimiter, express.json({ limit: '256kb' }), subscriptionController.appleWebhook);

router.use(authenticate);

router.get('/status', subscriptionController.getStatus);
router.post('/verify', subscriptionController.verifyReceipt);

module.exports = router;
