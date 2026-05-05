const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const community = require('../controllers/communityController');
const profile = require('../controllers/communityProfileController');
const interactions = require('../controllers/communityInteractionsController');
const sportFeed = require('../controllers/sportFeedController');
const dm = require('../controllers/dmController');
const moderation = require('../controllers/moderationController');

router.use(authenticate);

router.get('/feed/foryou', community.getForYouFeed);
router.get('/featured', community.getFeatured);
router.post('/_admin/featured/:postId', requireAdmin, community.adminFeaturePost);
router.delete('/_admin/featured/:postId', requireAdmin, community.adminUnfeaturePost);
router.get('/feed/friends', community.getFriendsFeed);
router.get('/sport-feed', sportFeed.getSportFeed);
router.post('/sport-feed/track-interaction', sportFeed.trackInteraction);
router.post('/sport-feed/_seed', sportFeed.adminSeed);

router.get('/messages/conversations', dm.listConversations);
router.post('/messages/conversations', dm.openConversation);
router.get('/messages/conversations/:id', dm.getMessages);
router.post('/messages/conversations/:id/messages', dm.sendMessage);
router.post('/messages/conversations/:id/read', dm.markRead);

router.post('/reports', moderation.createReport);
router.post('/blocks/:userId', moderation.block);
router.delete('/blocks/:userId', moderation.unblock);
router.get('/blocks', moderation.listBlocks);

router.get('/_admin/reports', requireAdmin, moderation.adminListReports);
router.post('/_admin/reports/:id/action', requireAdmin, moderation.adminActionReport);
router.post('/posts', community.createPost);
router.get('/posts/:id', community.getPost);
router.delete('/posts/:id', community.deletePost);

router.post('/posts/:id/like', interactions.likePost);
router.delete('/posts/:id/like', interactions.unlikePost);
router.post('/posts/:id/save', interactions.savePost);
router.delete('/posts/:id/save', interactions.unsavePost);
router.get('/posts/:id/comments', interactions.getComments);
router.post('/posts/:id/comments', interactions.createComment);
router.delete('/comments/:id', interactions.deleteComment);

router.get('/users/me', profile.getMyProfile);
router.put('/users/me/handle', profile.setHandle);
router.put('/users/me/bio', profile.setBio);
router.put('/users/me/notifications', profile.setNotificationPref);
router.get('/users/:id', profile.getProfile);
router.post('/users/:id/follow', profile.follow);
router.delete('/users/:id/follow', profile.unfollow);

module.exports = router;
