// src/Middlewares/upload.js (UPDATED FOR MULTIPLE FILES)
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Create uploads directory if it doesn't exist
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    console.log('📁 Multer destination called');
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    console.log('📝 Multer filename called');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
    console.log('📝 Generated filename:', filename);
    cb(null, filename);
  }
});

// File filter for images
const fileFilter = (req, file, cb) => {
  console.log('🔍 File filter checking:', file.originalname, file.mimetype);
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    console.log('✅ File accepted');
    cb(null, true);
  } else {
    console.log('❌ File rejected');
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Configure multer
const multerUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit per file
  },
  fileFilter: fileFilter
});

// Wrapper middleware to handle multer errors properly
const upload = {
  single: (fieldName) => {
    return (req, res, next) => {
      console.log('🎬 Upload middleware started (single)');
      const uploadSingle = multerUpload.single(fieldName);
      
      uploadSingle(req, res, (err) => {
        console.log('🏁 Multer finished processing (single)');
        
        if (err) {
          console.log('❌ Multer error:', err.message);
          
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size is 5MB'
              });
            }
            return res.status(400).json({
              success: false,
              message: err.message
            });
          }
          
          return res.status(400).json({
            success: false,
            message: err.message
          });
        }
        
        console.log('✅ File uploaded successfully, calling next()');
        if (req.file) {
          console.log('📎 File details:', req.file);
        } else {
          console.log('ℹ️ No file uploaded');
        }
        next();
      });
    };
  },
  
  // NEW: Array method for multiple files
  array: (fieldName, maxCount = 5) => {
    return (req, res, next) => {
      console.log('🎬 Upload middleware started (array)', { fieldName, maxCount });
      const uploadArray = multerUpload.array(fieldName, maxCount);
      
      uploadArray(req, res, (err) => {
        console.log('🏁 Multer finished processing (array)');
        
        if (err) {
          console.log('❌ Multer error:', err.message);
          
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({
                success: false,
                message: 'One or more files exceed the 5MB size limit'
              });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
              return res.status(400).json({
                success: false,
                message: `Too many files. Maximum ${maxCount} files allowed`
              });
            }
            return res.status(400).json({
              success: false,
              message: err.message
            });
          }
          
          return res.status(400).json({
            success: false,
            message: err.message
          });
        }
        
        console.log('✅ Files uploaded successfully, calling next()');
        if (req.files && req.files.length > 0) {
          console.log(`📎 ${req.files.length} files uploaded:`, req.files.map(f => f.filename));
        } else {
          console.log('ℹ️ No files uploaded');
        }
        next();
      });
    };
  }
};

// Error handler middleware for multer
const handleMulterError = (err, req, res, next) => {
  console.log('🚨 Multer error handler called:', err?.message);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

export { upload, handleMulterError };