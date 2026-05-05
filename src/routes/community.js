const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const community = require('../controllers/communityController');
const profile = require('../controllers/communityProfileController');
const interactions = require('../controllers/communityInteractionsController');
const sportFeed = require('../controllers/sportFeedController');
const dm = require('../controllers/dmController');

router.use(authenticate);

router.get('/feed/foryou', community.getForYouFeed);
router.get('/feed/friends', community.getFriendsFeed);
router.get('/sport-feed', sportFeed.getSportFeed);
router.post('/sport-feed/track-interaction', sportFeed.trackInteraction);
router.post('/sport-feed/_seed', sportFeed.adminSeed);

router.get('/messages/conversations', dm.listConversations);
router.post('/messages/conversations', dm.openConversation);
router.get('/messages/conversations/:id', dm.getMessages);
router.post('/messages/conversations/:id/messages', dm.sendMessage);
router.post('/messages/conversations/:id/read', dm.markRead);
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
router.get('/users/:id', profile.getProfile);
router.post('/users/:id/follow', profile.follow);
router.delete('/users/:id/follow', profile.unfollow);

module.exports = router;
