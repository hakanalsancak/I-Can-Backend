const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/apple', authLimiter, authController.appleSignIn);
router.post('/google', authLimiter, authController.googleSignIn);
router.post('/refresh', authLimiter, authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.put('/onboarding', authenticate, authController.completeOnboarding);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/link-apple', authenticate, authController.linkApple);
router.put('/link-google', authenticate, authController.linkGoogle);
router.delete('/account', authenticate, authController.deleteAccount);

module.exports = router;
