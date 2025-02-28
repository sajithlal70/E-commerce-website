const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require("sharp");

// Ensure product upload directory exists
const productUploadDir = path.join(__dirname, '../public/uploads/products');
if (!fs.existsSync(productUploadDir)) {
    fs.mkdirSync(productUploadDir, { recursive: true });
}

// Ensure category upload directory exists
const categoryUploadDir = path.join(__dirname, '../public/uploads/categories');
if (!fs.existsSync(categoryUploadDir)) {
    fs.mkdirSync(categoryUploadDir, { recursive: true });
}

const profileImgUploadDir = path.join(__dirname, '../public/uploads/profile');
if (!fs.existsSync(profileImgUploadDir)) {
    fs.mkdirSync(profileImgUploadDir, { recursive: true });
}

// Configure product image storage
const productStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, productUploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Configure category image storage
const categoryStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, categoryUploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'category-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const profileImgStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, profileImgUploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, `profile-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
    }
});

// File filter for images
const imageFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|webp|WEBP)$/)) {
        req.fileValidationError = 'Only image files are allowed!';
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

// Configure multer for product images
const productUpload = multer({
    storage: productStorage,
    fileFilter: imageFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
        files: 4 // Maximum 4 files
    }
});

// Configure multer for category images
const categoryUpload = multer({
    storage: categoryStorage,
    fileFilter: imageFilter,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB max file size
        files: 1 // Maximum 1 file
    }
});

// Storage Configuration

// Profile Image Storage Configuration
const profileImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, profileImageUploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${req.user.id}-${Date.now()}${ext}`);
    },
  });
  
  // File filter for images only
const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed!"), false);
    }
};

  const profileImageUpload = multer({
    storage: profileImageStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
  });
  

// Error handler middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 5MB'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum is 4 files'
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected field name in upload'
            });
        }
    }
    next(err);
};

// Custom middleware to handle file uploads for products
const uploadProductImages = (req, res, next) => {
    const upload = productUpload.array('images', 4);
    
    upload(req, res, function(err) {
        if (err) {
            return handleMulterError(err, req, res, next);
        }
        next();
    });
};

// Custom middleware to handle file uploads for categories
const uploadCategoryImage = (req, res, next) => {
    const upload = categoryUpload.single('image');
    
    upload(req, res, function(err) {
        if (err) {
            return handleMulterError(err, req, res, next);
        }
        next();
    });
};

module.exports = {
    productUpload: uploadProductImages,
    categoryUpload: uploadCategoryImage,
    profileImageUpload,
    handleMulterError
};