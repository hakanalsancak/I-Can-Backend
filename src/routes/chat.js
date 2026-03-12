const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

router.use(authenticate);

router.post('/', chatController.chat);

module.exports = router;
