const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const leaderboardController = require('../controllers/leaderboardController');

router.use(authenticate);

router.get('/', leaderboardController.getGlobalLeaderboard);
router.get('/country/:code', leaderboardController.getCountryLeaderboard);

module.exports = router;
