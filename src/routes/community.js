const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const community = require('../controllers/communityController');
const profile = require('../controllers/communityProfileController');

router.use(authenticate);

router.get('/feed/foryou', community.getForYouFeed);
router.post('/posts', community.createPost);
router.get('/posts/:id', community.getPost);
router.delete('/posts/:id', community.deletePost);

router.get('/users/me', profile.getMyProfile);
router.put('/users/me/handle', profile.setHandle);
router.put('/users/me/bio', profile.setBio);
router.get('/users/:id', profile.getProfile);
router.post('/users/:id/follow', profile.follow);
router.delete('/users/:id/follow', profile.unfollow);

module.exports = router;
