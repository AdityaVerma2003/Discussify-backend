import express from 'express';
import { register, login, verifyEmail, resendOTP, getMe , forgotPassword , resetPassword, updateProfile } from '../Controllers/AuthController.js';
import { protect } from '../Middlewares/AuthMiddleware.js';
import { upload } from '../Middlewares/upload.js';

const router = express.Router();

// Debug middleware for this router
router.use((req, res, next) => {
  console.log('🛣️ Auth route hit:', req.method, req.path);
  next();
});

// Public routes
router.post('/register', 
  upload.single('profileImage'), 
  register
);

router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-otp', resendOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.patch('/update-profile', protect, upload.single('profileImage'), updateProfile);

export default router;