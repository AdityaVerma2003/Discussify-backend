import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_\s]+$/, 'Username can only contain letters, numbers, underscores, and spaces']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  profileImage: {
    type: String,
    default: null
  },
  // UPDATED: Interests are now constrained to the same categories as the communities
  interests: [{
    type: String,
    enum: [
      'Technology',
      'Gaming',
      'Sports',
      'Music',
      'Art',
      'Education',
      'Science',
      'Business',
      'Health',
      'Food',
      'Travel',
      'Fashion',
      'Entertainment',
      'Books',
      'Photography',
      'Other'
    ],
    trim: true
  }],
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  joinedCommunities: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community'
  }],
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: {
    type: String,
    select: false
  },
  otpExpires: {
    type: Date,
    select: false
  },
  resetPasswordToken: String, // Dedicated field for password reset OTP/Token
  resetPasswordExpires: Date, // Dedicated field for password reset expiry
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP for Email Verification (Existing)
userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailVerificationOTP = otp;
  this.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return otp;
};

// Verify OTP for Email Verification (Existing)
userSchema.methods.verifyOTP = function(otp) {
  if (!this.emailVerificationOTP || !this.otpExpires) {
    return false;
  }
  
  if (Date.now() > this.otpExpires) {
    return false;
  }
  
  return this.emailVerificationOTP === otp;
};

// --- NEW Password Reset Methods ---

/**
 * Generates a 6-digit numeric OTP for password reset and stores it in the dedicated fields.
 * @returns {string} The generated OTP.
 */
userSchema.methods.getResetPasswordOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.resetPasswordToken = otp;
  // Set expiry to 10 minutes from now
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
  return otp;
};

/**
 * Verifies if the provided OTP is valid and has not expired.
 * @param {string} otp - The OTP provided by the user.
 * @returns {boolean} True if OTP is valid and not expired, otherwise false.
 */
userSchema.methods.verifyResetPasswordOTP = function(otp) {
  if (!this.resetPasswordToken || !this.resetPasswordExpires) {
    return false; // No token stored
  }
  
  // Check for expiry
  if (Date.now() > this.resetPasswordExpires) {
    return false; 
  }
  
  // Check if OTP matches
  return this.resetPasswordToken === otp;
};

export default mongoose.model('User', userSchema);