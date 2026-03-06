const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const streakController = require('../controllers/streakController');

router.use(authenticate);

router.get('/', streakController.getStreak);

module.exports = router;
