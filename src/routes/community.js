const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');

// Up to 100 MB per file; videos can be longer than 5 min in raw uploads from
// older phones, so let the upload through and validate duration on the client.
const dmUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});
const profile = require('../controllers/communityProfileController');
const sportFeed = require('../controllers/sportFeedController');
const dm = require('../controllers/dmController');
const moderation = require('../controllers/moderationController');

router.use(authenticate);

router.get('/sport-feed', sportFeed.getSportFeed);
router.post('/sport-feed/track-interaction', sportFeed.trackInteraction);
router.post('/sport-feed/_seed', sportFeed.adminSeed);

router.get('/messages/conversations', dm.listConversations);
router.post('/messages/conversations', dm.openConversation);
router.get('/messages/conversations/:id', dm.getMessages);
router.post('/messages/conversations/:id/messages', dm.sendMessage);
router.delete('/messages/conversations/:id/messages/:messageId', dm.deleteMessage);
router.post('/messages/conversations/:id/read', dm.markRead);
router.post('/messages/upload', dmUpload.single('file'), dm.uploadMedia);

router.post('/reports', moderation.createReport);
router.post('/blocks/:userId', moderation.block);
router.delete('/blocks/:userId', moderation.unblock);
router.get('/blocks', moderation.listBlocks);

router.get('/_admin/reports', requireAdmin, moderation.adminListReports);
router.post('/_admin/reports/:id/action', requireAdmin, moderation.adminActionReport);

router.get('/users/me', profile.getMyProfile);
router.put('/users/me/handle', profile.setHandle);
router.put('/users/me/bio', profile.setBio);
router.put('/users/me/notifications', profile.setNotificationPref);
router.get('/users/:id', profile.getProfile);
router.post('/users/:id/follow', profile.follow);
router.delete('/users/:id/follow', profile.unfollow);

module.exports = router;
