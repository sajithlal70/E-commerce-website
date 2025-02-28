const { name } = require("ejs");
const Category = require("../../models/categorySchema");
const {categoryUpload} = require("../../middlewares/multer");
const processImage = require("../../middlewares/ImageProcessor");
const path = require("path")
const { validateImage } = require('../../middlewares/categoryMiddleware');
const fs = require('fs');

const categoryInfo = async (req,res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page-1)*limit;

    const categoryData = await Category.find({})
    .sort({createdAt:-1})
    .skip(skip)
    .limit(limit);

    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);
    const adminName = req.session.admin.name;
    
    res.render("category", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      adminName
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching category details"
    });
  }
};

const addCategory = async (req, res) => {
  try {
    // Basic validation
    if (!req.body.name || !req.body.name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    if (!req.body.description || !req.body.description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Description is required"
      });
    }

    // Validate offer price if provided
    if (req.body.offerPrice) {
      const price = parseFloat(req.body.offerPrice);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: "Offer price must be a positive number"
        });
      }
    }

    // Validate image
    if (!req.body.croppedImage) {
      return res.status(400).json({
        success: false,
        message: "Category image is required"
      });
    }

    // Handle base64 image data
    let imagePath = '';
    try {
      const base64Data = req.body.croppedImage.replace(/^data:image\/jpeg;base64,/, "");
      const filename = `category_${Date.now()}.jpg`;
      
      // Ensure directory exists
      const uploadDir = path.join(__dirname, '../../public/uploads/categories');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const uploadPath = path.join(uploadDir, filename);
      await fs.promises.writeFile(uploadPath, base64Data, 'base64');
      imagePath = `/uploads/categories/${filename}`;
    } catch (error) {
      console.error('Error saving image:', error);
      return res.status(500).json({
        success: false,
        message: "Error saving category image"
      });
    }

    const { name, description, offerPrice, offer } = req.body;
    const adminName = req.session.admin.name;

    // Check for existing category
    const existingCategory = await Category.findOne({ 
      name: { $regex: `^${name.trim()}$`, $options: 'i' } 
    });
    
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category already exists"
      });
    }

    // Create and save new category
    const newCategory = new Category({
      name: name.trim(),
      description: description.trim(),
      offerPrice: offerPrice || 0,
      offer: offer || '',
      status: 'Listed',
      adminName,
      image: imagePath
    });

    await newCategory.save();

    return res.status(200).json({
      success: true,
      message: "Category added successfully",
      category: newCategory
    });

  } catch (error) {
    console.error('Error in addCategory:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, offerPrice, offer, existingImage, removeImage, croppedImage } = req.body;
    const adminName = req.session.admin.name;

    // Basic validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Description is required"
      });
    }

    // Check if category exists
    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check if new name conflicts with other categories (case-insensitive)
    if (name.toLowerCase() !== existingCategory.name.toLowerCase()) {
      const nameExists = await Category.findOne({
        _id: { $ne: id },
        name: { $regex: `^${name.trim()}$`, $options: 'i' }
      });
      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: "Category name already exists"
        });
      }
    }

    // Prepare update data
    const updateData = {
      name: name.trim(),
      description: description.trim(),
      offerPrice: offerPrice || 0,
      offer: offer || '',
      adminName
    };

    // Handle image update
    if (removeImage === 'true') {
      // Remove image
      updateData.image = '';
    } else if (croppedImage) {
      // Save new cropped image
      try {
        const base64Data = croppedImage.replace(/^data:image\/jpeg;base64,/, "");
        const filename = `category_${Date.now()}.jpg`;
        
        // Ensure directory exists
        const uploadDir = path.join(__dirname, '../../public/uploads/categories');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const uploadPath = path.join(uploadDir, filename);
        await fs.promises.writeFile(uploadPath, base64Data, 'base64');
        updateData.image = `/uploads/categories/${filename}`;
      } catch (error) {
        console.error('Error saving image:', error);
        return res.status(500).json({
          success: false,
          message: "Error saving category image"
        });
      }
    } else if (existingImage) {
      // Keep existing image
      updateData.image = existingImage;
    }

    // Update category
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category: updatedCategory
    });

  } catch (error) {
    console.error('Error in editCategory:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

const toggleCategoryStatus = async (req, res) => {
  try {
      const { id } = req.params;
      console.log('Attempting to toggle category status for ID:', id);
      
      const category = await Category.findById(id);
      
      if (!category) {
          console.log('Category not found for ID:', id);
          return res.status(404).json({
              success: false,
              message: "Category not found"
          });
      }

      const previousStatus = category.status;
      category.status = category.status === 'Listed' ? 'Unlisted' : 'Listed';
      
      console.log(`Updating category status from ${previousStatus} to ${category.status}`);
      
      await category.save();
      
      console.log('Category status updated successfully');

      return res.status(200).json({
          success: true,
          message: `Category ${category.status === 'Listed' ? 'listed' : 'unlisted'} successfully`
      });
  } catch (error) {
      console.error('Error in toggleCategoryStatus:', error);
      return res.status(500).json({
          success: false,
          message: "Internal server error"
      });
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  toggleCategoryStatus,
  editCategory,
//   editCategory,
//   deleteCategory,
// }
}