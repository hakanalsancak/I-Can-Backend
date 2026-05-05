const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const community = require('../controllers/communityController');

router.use(authenticate);

router.get('/feed/foryou', community.getForYouFeed);
router.post('/posts', community.createPost);
router.get('/posts/:id', community.getPost);
router.delete('/posts/:id', community.deletePost);

module.exports = router;
