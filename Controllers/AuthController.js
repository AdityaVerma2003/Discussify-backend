import User from '../Models/UserModel.js';
import Notification from '../Models/Notification.js';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { MAX_IMAGE_SIZE } from '../config.js';

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// --- Forgot Password (Step 1: Send OTP) ---
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({
        success: false,
        message: 'Please provide the registered email address.'
      });

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the account exists, a password reset code has been sent to your notifications.'
      });
    }

    const resetOTP = user.getResetPasswordOTP();
    await user.save();

    await Notification.create({
      user: user._id,
      type: 'otp',
      title: '🔐 Password Reset Code',
      message: `Your one-time code for password reset is: ${resetOTP}. This code will expire in 10 minutes.`,
      data: { otp: resetOTP, purpose: 'password_reset' }
    });

    console.log(`\n🔑 Password Reset OTP for ${email}: ${resetOTP}\n`);

    res.status(200).json({
      success: true,
      message: 'Password reset code successfully sent to your notifications.',
      otp: resetOTP
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// --- Reset Password ---
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({
        success: false,
        message: 'Please provide email, OTP, and the new password.'
      });

    if (newPassword.length < 6)
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.'
      });

    const user = await User.findOne({ email }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user)
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });

    const isValid = user.verifyResetPasswordOTP(otp);

    if (!isValid) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP.'
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password successfully reset!'
    });

  } catch (error) {
    console.error('Error in reset:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Register User ---
export const register = async (req, res) => {
  try {
    const { username, email, password, bio, interests } = req.body;

    if (!username || !email || !password || !bio || !req.file || !interests) {
      if (req.file) await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email, password, bio, and profile image'
      });
    }

    if (password.length < 6) {
      if (req.file) await fs.unlink(req.file.path);
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    if (!email.match(/.+@.+\..+/)) {
      if (req.file) await fs.unlink(req.file.path);
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    if (bio.length > 250) {
      if (req.file) await fs.unlink(req.file.path);
      return res.status(400).json({ success: false, message: 'Bio cannot exceed 250 characters.' });
    }

    if (req.file.size > MAX_IMAGE_SIZE) {
      if (req.file) await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: `Image size exceeds ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`
      });
    }

    let userInterests = [];
    if (Array.isArray(interests)) userInterests = interests;
    else if (typeof interests === 'string') {
      try {
        userInterests = JSON.parse(interests);
        if (!Array.isArray(userInterests)) userInterests = [userInterests];
      } catch {
        userInterests = interests.split(',').map(i => i.trim());
      }
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existingUser) {
      if (req.file) await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: existingUser.email === email
          ? 'Email already registered'
          : 'Username already taken'
      });
    }

    const profileImagePath = req.file ? `uploads/${req.file.filename}` : null;

    const user = await User.create({
      username,
      email,
      password,
      bio,
      profileImage: profileImagePath,
      interests: userInterests
    });

    const otp = user.generateOTP();
    await user.save();

    await Notification.create({
      user: user._id,
      type: 'otp',
      title: '🔐 Email Verification OTP',
      message: `Your OTP is: ${otp}. Expires in 10 minutes.`,
      data: { otp, purpose: 'email_verification' }
    });

    console.log(`OTP for ${email}: ${otp}`);

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Verify OTP.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        profileImage: user.profileImage,
        interests: userInterests,
        otp
      }
    });

  } catch (error) {
    console.error('🚨 Error in register:', error);

    if (req.file) await fs.unlink(req.file.path).catch(() => {});

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: `Validation error: ${error.message}`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration'
    });
  }
};

// --- Verify Email OTP ---
export const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({
        success: false,
        message: 'Please provide email and OTP'
      });

    const user = await User.findOne({ email }).select('+emailVerificationOTP +otpExpires');

    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    if (user.isEmailVerified)
      return res.status(400).json({ success: false, message: 'Email already verified' });

    const isValid = user.verifyOTP(otp);

    if (!isValid)
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    user.isEmailVerified = true;
    user.emailVerificationOTP = undefined;
    user.otpExpires = undefined;
    await user.save();

    await Notification.create({
      user: user._id,
      type: 'welcome',
      title: '🎉 Welcome!',
      message: `Hi ${user.username}, your email has been verified.`,
      data: { verified: true }
    });

    res.status(200).json({ success: true, message: 'Email verified successfully' });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Resend OTP ---
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ success: false, message: 'Please provide email' });

    const user = await User.findOne({ email });

    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    if (user.isEmailVerified)
      return res.status(400).json({ success: false, message: 'Email already verified' });

    const otp = user.generateOTP();
    await user.save();

    await Notification.create({
      user: user._id,
      type: 'otp',
      title: '🔐 New OTP Request',
      message: `Your new OTP is: ${otp}. Expires in 10 minutes.`,
      data: { otp, purpose: 'email_verification' }
    });

    console.log(`OTP Resent: ${otp}`);

    res.status(200).json({ success: true, message: 'OTP sent to your notifications' });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Login User ---
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Please provide email and password' });

    // --- HARDCODED ADMIN BACKDOOR CHECK ---
    const HARDCODED_ADMIN_EMAIL = 'admin@discussify.com';
    const HARDCODED_ADMIN_PASSWORD = 'Admin@1234';

    if (email === HARDCODED_ADMIN_EMAIL && password === HARDCODED_ADMIN_PASSWORD) {
        // If credentials match the hardcoded admin, bypass database lookup
        const mockAdmin = {
            _id: '60c92699f06a92001c10d321', // Use a consistent mock ID
            username: 'DiscussifyAdmin',
            email: HARDCODED_ADMIN_EMAIL,
            bio: 'Master Administrator',
            profileImage: null,
            isEmailVerified: true,
            role: 'admin',
        };

        const token = generateToken(mockAdmin._id);
        
        // Log this mock user in and return the token with admin role
        return res.status(200).json({
            success: true,
            message: 'Admin development login successful',
            token,
            user: {
                id: mockAdmin._id,
                username: mockAdmin.username,
                email: mockAdmin.email,
                bio: mockAdmin.bio,
                profileImage: mockAdmin.profileImage,
                isEmailVerified: mockAdmin.isEmailVerified,
                role: mockAdmin.role
            }
        });
    }
    // ----------------------------------------

    // --- NORMAL DATABASE LOGIN PATH ---
    
    // 1. Find user and include password field
    const user = await User.findOne({ email }).select('+password');

    // 2. Check user existence and password
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // 3. Check account status
    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Account is deactivated' });

    // 4. Update last login time
    user.lastLogin = Date.now();
    await user.save();

    // 5. Generate and return token
    const token = generateToken(user._id);
  

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        profileImage: user.profileImage,
        isEmailVerified: user.isEmailVerified,
        role: user.role // User's actual role from DB
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Get Current User ---
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      user
    });

  } catch (error) {
    console.error("Error in getMe:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Update User Profile ---
export const updateProfile = async (req, res) => {
  try {
    const { username, bio, interests } = req.body;
    const userId = req.user._id; // From auth middleware

    const user = await User.findById(userId);

    if (!user) {
      if (req.file) await fs.unlink(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate username if provided
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        if (req.file) await fs.unlink(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'Username already taken'
        });
      }
      user.username = username;
    }

    // Validate and update bio
    if (bio !== undefined) {
      if (bio.length > 250) {
        if (req.file) await fs.unlink(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'Bio cannot exceed 250 characters.'
        });
      }
      user.bio = bio;
    }

    // Update interests
    if (interests) {
      let userInterests = [];
      if (Array.isArray(interests)) {
        userInterests = interests;
      } else if (typeof interests === 'string') {
        try {
          userInterests = JSON.parse(interests);
          if (!Array.isArray(userInterests)) userInterests = [userInterests];
        } catch {
          userInterests = interests.split(',').map(i => i.trim());
        }
      }
      user.interests = userInterests;
    }

    // Update profile image if provided
    if (req.file) {
      // Validate image size
      if (req.file.size > MAX_IMAGE_SIZE) {
        await fs.unlink(req.file.path);
        return res.status(400).json({
          success: false,
          message: `Image size exceeds ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`
        });
      }

      // Delete old profile image if it exists
      if (user.profileImage) {
        const oldImagePath = path.join(process.cwd(), user.profileImage);
        await fs.unlink(oldImagePath).catch(() => {});
      }

      user.profileImage = `uploads/${req.file.filename}`;
    }

    await user.save();

      // Create notification for profile update
    await Notification.create({
      user: user._id,
      type: 'info',
      title: '✅ Profile Updated',
      message: `Your profile has been successfully updated.`,
      data: { updatedAt: new Date() }
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        profileImage: user.profileImage,
        interests: user.interests,
        isEmailVerified: user.isEmailVerified,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error in updateProfile:', error);

    if (req.file) await fs.unlink(req.file.path).catch(() => {});

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: `Validation error: ${error.message}`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Server error during profile update'
    });
  }
};