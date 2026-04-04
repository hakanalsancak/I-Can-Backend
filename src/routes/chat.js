const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const chatController = require('../controllers/chatController');
const conversationController = require('../controllers/conversationController');

router.use(authenticate);

router.post('/', aiLimiter, chatController.chat);

router.get('/conversations', conversationController.listConversations);
router.get('/conversations/:id/messages', conversationController.getMessages);
router.delete('/conversations/:id', conversationController.deleteConversation);

module.exports = router;
