const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const feedbackController = require('../controllers/feedbackController');

router.use(authenticate);

router.post('/', feedbackController.submit);

module.exports = router;
