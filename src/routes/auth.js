const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  },
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/apple', authLimiter, authController.appleSignIn);
router.post('/google', authLimiter, authController.googleSignIn);
router.post('/refresh', authLimiter, authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);
router.put('/onboarding', authenticate, authController.completeOnboarding);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/profile/photo', authenticate, upload.single('photo'), authController.uploadPhoto);
router.delete('/profile/photo', authenticate, authController.deletePhoto);
router.put('/link-apple', authenticate, authController.linkApple);
router.put('/link-google', authenticate, authController.linkGoogle);
router.delete('/account', authenticate, authController.deleteAccount);

module.exports = router;
