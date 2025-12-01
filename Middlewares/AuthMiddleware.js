import jwt from 'jsonwebtoken';
import User from '../Models/UserModel.js';

// --- CONSTANT FOR HARDCODED ADMIN CHECK ---
// Must match the ID used in the login controller
const MOCK_ADMIN_ID = '60c92699f06a92001c10d321';
const MOCK_ADMIN_EMAIL = 'admin@discussify.com';

const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verified:', decoded);

    // --- NEW LOGIC: HANDLE HARDCODED ADMIN USER ---
    if (decoded.id === MOCK_ADMIN_ID) {
        req.user = {
            _id: MOCK_ADMIN_ID,
            username: 'DiscussifyAdmin',
            email: MOCK_ADMIN_EMAIL,
            role: 'admin',
            isActive: true, // Always active for mock admin
            // Include other necessary fields to match the database schema expectations
        };
    } else {
        // --- NORMAL DATABASE USER LOOKUP ---
        // Get user from token
        req.user = await User.findById(decoded.id).select('-password');
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // This check applies to both real users and the mock admin (who is set to true)
    if (!req.user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Role-based authorization (No change needed here, as it relies on req.user.role)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role || 'unknown'} is not authorized to access this route`
      });
    }
    next();
  };
};

export { protect, authorize };