const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const friendController = require('../controllers/friendController');

router.get('/check-username', optionalAuth, friendController.checkUsername);

router.use(authenticate);

router.get('/search', friendController.searchUsers);
router.get('/requests', friendController.getPendingRequests);
router.get('/requests/sent', friendController.getSentRequests);
router.get('/', friendController.getFriends);
router.get('/profile/:id', friendController.getFriendProfile);
router.get('/profile/:id/logs', friendController.getFriendLogs);

router.post('/request', friendController.sendRequest);
router.put('/request/:id', friendController.respondToRequest);
router.delete('/request/:id', friendController.cancelRequest);
router.delete('/:id', friendController.removeFriend);

module.exports = router;
