const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const chatController = require('../controllers/chatController');

router.use(authenticate);

router.post('/', aiLimiter, chatController.chat);

module.exports = router;
