const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimiter');
const chatController = require('../controllers/chatController');

router.use(authenticate);

router.post('/', chatLimiter, chatController.chat);

module.exports = router;
