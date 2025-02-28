const validateCategoryUpdate = (req, res, next) => {
  const { name, description } = req.body;
  const errors = [];

  // Validate name
  if (!name || name.trim().length === 0) {
    errors.push('Category name is required');
  } else if (name.trim().length < 2) {
    errors.push('Category name must be at least 2 characters long');
  }

  // Validate description
  if (!description || description.trim().length === 0) {
    errors.push('Description is required');
  }

  // Optional: Validate offer price if provided
  const offerPrice = parseFloat(req.body.offerPrice);
  if (req.body.offerPrice && (isNaN(offerPrice) || offerPrice < 0)) {
    errors.push('Offer price must be a positive number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors.join(', ')
    });
  }

  next();
};

const validateImage = (file) => {
  const errors = [];
  
  if (file) {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      errors.push('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed');
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      errors.push('Image size must be less than 5MB');
    }
  }

  return errors;
};

module.exports = {
  validateCategoryUpdate,
  validateImage
}; 