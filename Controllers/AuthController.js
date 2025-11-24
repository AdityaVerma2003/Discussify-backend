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

// --- NEW: Forgot Password (Step 1: Send OTP) ---
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the registered email address.'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Security best practice: return a generic success message
      // even if the user is not found to prevent user enumeration.
      return res.status(200).json({
        success: true,
        message: 'If the account exists, a password reset code has been sent to your notifications.'
      });
    }

    // 1. Generate and save the dedicated Reset Password OTP
    const resetOTP = user.getResetPasswordOTP();
    await user.save();

    // 2. Create in-app notification with the reset OTP
    await Notification.create({
      user: user._id,
      type: 'otp',
      title: '🔐 Password Reset Code',
      message: `Your one-time code for password reset is: ${resetOTP}. This code will expire in 10 minutes.`,
      data: { otp: resetOTP, purpose: 'password_reset' }
    });
    
    // Console log for development (user copies from here)
    console.log(`\n🔑 Password Reset OTP for ${email}: ${resetOTP} (Expires in 10 minutes)\n`);

    res.status(200).json({
      success: true,
      message: 'Password reset code successfully sent to your notifications.',
      otp : resetOTP  // For development purposes only
    });

  } catch (error) {
    console.error('🚨 Error in forgotPassword controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during password reset request.'
    });
  }
};


// --- NEW: Reset Password (Step 2: Verify OTP and Update Password) ---
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, OTP, and the new password.'
      });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ status: 'fail', message: 'New password must be at least 6 characters long.' });
    }

    // Find user and explicitly select the reset fields
    const user = await User.findOne({ email })
      .select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // 1. Verify the OTP
    const isValid = user.verifyResetPasswordOTP(otp);

    if (!isValid) {
      // Clear expired or incorrect token to prevent repeated attempts
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Please restart the forgot password process.'
      });
    }

    // 2. Verification successful: Update password and clear fields
    user.password = newPassword; // Pre-save hook will hash this
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password successfully reset! You can now log in with your new password.'
    });

  } catch (error) {
    console.error('🚨 Error in resetPassword controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during password reset.'
    });
  }
};


// Register User
export const register = async (req, res) => {
  
  // 1. Destructure 'interests' from the request body
  try {
    const { username, email, password, bio, interests } = req.body;

    // --- Validation Section ---

    // Validate required fields (excluding interests as they are optional)
    if (!username || !email || !password || !bio || !req.file || !interests) {
      console.log('❌ Validation failed - missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email, password, bio, and profile image'
      });
    }

    if (password.length < 6) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ status: 'fail', message: 'Password must be at least 6 characters long.' });
    }
    
    // Simple email format validation
    if (!email.match(/.+@.+\..+/)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ status: 'fail', message: 'Invalid email format.' });
    }

    // Bio length check
    if (bio.length > 250) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ status: 'fail', message: 'Bio cannot exceed 250 characters.' });
    }

    // File size check 
    if (req.file.size > MAX_IMAGE_SIZE) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ status: 'fail', message: `Image file size exceeds the ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit.` });
    }
    
    // 2. Prepare interests data for saving
    let userInterests = [];
    if (interests) {
        // If the interests are sent as a single string (e.g., in application/x-www-form-urlencoded), 
        // try to parse it as an array of categories. Frontend should ideally send a JSON array.
        if (Array.isArray(interests)) {
            userInterests = interests;
        } else if (typeof interests === 'string') {
            try {
                // Try parsing it as a JSON array string
                userInterests = JSON.parse(interests);
                if (!Array.isArray(userInterests)) userInterests = [userInterests]; // Handle single item parsed
            } catch (e) {
                // Fallback: assume it's a comma-separated list or just a single interest
                userInterests = interests.split(',').map(i => i.trim()).filter(i => i.length > 0);
            }
        }
        
        // Mongoose will handle the enum validation during User.create
        // We ensure it is an array of strings (which could be empty)
        if (!Array.isArray(userInterests)) userInterests = [];
    }
    
    // --- Check Existing User ---
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      console.log('❌ User already exists');
      if (req.file) fs.unlinkSync(req.file.path); // Delete file if user exists
      return res.status(400).json({
        success: false,
        message: existingUser.email === email 
          ? 'Email already registered' 
          : 'Username already taken'
      });
    }

    console.log('✅ No existing user found');

    // Handle profile image upload
    let profileImagePath = null;
    if (req.file) {
      profileImagePath = `uploads/${req.file.filename}`;
      console.log('📸 Profile image path:', profileImagePath);
    }

    console.log('📝 Creating user...');
    // 3. Create user, including the processed interests
    const user = await User.create({
      username,
      email,
      password,
      bio: bio || '',
      profileImage: profileImagePath,
      interests: userInterests // <-- SAVING USER INTERESTS
    });

    console.log('✅ User created:', user._id);

    // Generate OTP
    console.log('🔑 Generating OTP...');
    const otp = user.generateOTP();
    await user.save();
    console.log('✅ OTP generated and saved');

    // Create in-app notification with OTP
    console.log('📬 Creating notification...');
    await Notification.create({
      user: user._id,
      type: 'otp',
      title: '🔐 Email Verification OTP',
      message: `Your OTP for email verification is: ${otp}. This code will expire in 10 minutes.`,
      data: { otp, purpose: 'email_verification' }
    });
    console.log('✅ Notification created');

    // Console log for development (user copies from here)
    console.log(`\n🔑 OTP for ${email}: ${otp} (Expires in 10 minutes)\n`);

    // Generate token
    console.log('🎫 Generating JWT token...');
    const token = generateToken(user._id);
    console.log('✅ Token generated');

    console.log('📤 Sending response...');
    // 4. Update response to include interests
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your notifications for OTP.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        profileImage: user.profileImage,
        isEmailVerified: user.isEmailVerified,
        interests: userInterests, // <-- Including interests in response
        otp: otp  // For development purposes only
      }
    });
    console.log('✅ Response sent successfully');

  } catch (error) {
    console.error('🚨 Error in register controller:', error);
    console.error('Error stack:', error.stack);
    
    // Delete uploaded file if registration fails
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => console.error('File deletion error:', err));
    }

    // Check for Mongoose validation errors (e.g., invalid interest enum value)
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
// Verify Email OTP
export const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and OTP'
      });
    }

    const user = await User.findOne({ email })
      .select('+emailVerificationOTP +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    const isValid = user.verifyOTP(otp);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationOTP = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Create welcome notification
    await Notification.create({
      user: user._id,
      type: 'welcome',
      title: '🎉 Welcome to Our Platform!',
      message: `Hi ${user.username}! Your email has been successfully verified. Start exploring and connecting with the community!`,
      data: { verified: true }
    });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during verification'
    });
  }
};

// Resend OTP
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    const otp = user.generateOTP();
    await user.save();

    // Create new notification with OTP
    await Notification.create({
      user: user._id,
      type: 'otp',
      title: '🔐 New OTP Request',
      message: `Your new OTP for email verification is: ${otp}. This code will expire in 10 minutes.`,
      data: { otp, purpose: 'email_verification' }
    });

    // Console log for development
    console.log(`\n🔑 OTP Resent for ${email}: ${otp} (Expires in 10 minutes)\n`);

    res.status(200).json({
      success: true,
      message: 'OTP sent to your notifications'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

// Login User
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    user.lastLogin = Date.now();
    await user.save();

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
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login'
    });
  }
};

// Get Current User

export const getMe = async (req, res) => {
  try {
    console.log("request received", req.user);
    
    const user = await User.findById(req.user._id);
    
    console.log("user found", user);
    
    res.status(200).json({
      success: true,
      user
    });

  } catch (error) {
    console.error("Error in getMe:", error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};