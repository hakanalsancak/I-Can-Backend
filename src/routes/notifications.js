const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

router.use(authenticate);

router.put('/preferences', notificationController.updatePreferences);
router.post('/device-token', notificationController.registerDeviceToken);

module.exports = router;
