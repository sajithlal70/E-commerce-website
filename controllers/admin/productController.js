const Product =  require("../../models/productSchema");
const Category =require("../../models/categorySchema");
const User = require("../../models/userSchema");
const fs = require('fs').promises;
const path = require("path");
const sharp =require("sharp");

const productInfo = async (req, res) => {
  if (req.session && req.session.admin) {
    try { 
      const page = parseInt(req.query.page) || 1 ;
      const limit = parseInt(req.query.limit) || 5 ;
      const skip = (page-1) * limit ; 

      
      const category =await Category.find({status:"Listed"});
      const totalProducts = await Product.countDocuments({});
      const products = await Product.find({}).skip(skip).limit(limit).lean();
      const totalPages = Math.ceil(totalProducts/limit) ;

      res.render("products", { 
        cat:category,
        adminName: req.session.admin.name,
        products: products ,
        totalPages,
        currentPage:page,
        totalProducts,
        limit,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).send("An error occurred while loading the products page.");
    }
  } else {
    res.redirect("/admin/login");
  }
};

const addProducts = async(req, res) => {  
  try {

    const category =await Category.find({status:"Listed"});
    
    res.render("add-product",{
      cat:category,
      adminName: req.session.admin.name,
    })
    
  } catch (error) {
    console.error("Error rendering the add product page:", error);
    res.status(500).send("An error occurred while loading the add product page.");
  }
}


const createProduct = async (req, res) => {
  try {
      // Validate required fields
      const { 
          productName, 
          description,  
          category, 
          regularPrice, 
          salePrice, 
          quantity, 
          color, 
          status 
      } = req.body;

      // Validate uploaded images
      if (!req.files || req.files.length === 0) {
          return res.status(400).json({success: false,
            message: 'At least one product image is required'
        });
        }

        // Validate price and quantity
        if (parseFloat(regularPrice) <= 0 || parseFloat(salePrice) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Prices must be greater than zero'
            });
        }

        if (parseInt(quantity) < 1) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be at least 1'
            });
        }

        // Process uploaded images
        const productImages = req.files.map(file => file.filename);

        // Calculate product offer (percentage)
        const productOffer = regularPrice > 0 
            ? Math.round(((regularPrice - salePrice) / regularPrice) * 100) 
            : 0;

        // Create new product
        const newProduct = new Product({
            productName,
            description,
            category,
            reqularPrice: parseFloat(regularPrice),
            salePrice: parseFloat(salePrice),
            productOffer,
            quantity: parseInt(quantity),
            color,
            productImage: productImages,
            satatus: status || 'Available'
        });
        
        // Save product to database
        await newProduct.save();

        // Respond with success
        res.status(201).json({
            success: true,
            message: 'Product added successfully',
            product: newProduct
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add product',
            error: error.message
        });
    }
};



const geteditProducts = async (req, res) => {
  try {
      const {id} = req.params;
      const adminName =  req.session.admin.name;
      
      // Fetch the product
      const product = await Product.findById({_id:id});

      // Fetch categories 
      const categories = await Category.find();

      if (!product) {
          return res.status(404).send("Product not found");
      }

      res.render("edit-product", { 
          product,
          adminName,
          categories  // Pass categories to the view
      });
  } catch (error) {
      console.error("Error fetching product for editing:", error);
      res.status(500).send("Internal Server Error");
  }
};

// New method to handle product update


const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            productName, 
            description, 
            category, 
            regularPrice, 
            salePrice, 
            quantity, 
            color, 
            status,
            removedImages
        } = req.body;

        // Validate input
        if (!productName || !category) {
            req.flash('error', 'Product name and category are required');
            return res.redirect(`/admin/productsedit/${id}`);
        }

        // Find existing product
        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            req.flash('error', 'Product not found');
            return res.redirect("/admin/products");
        }

        // Process existing images
        let updatedImages = existingProduct.productImage || [];

        // Parse removed images
        let imagesToRemove = [];
        if (removedImages) {
            try {
                imagesToRemove = JSON.parse(removedImages);
            } catch (error) {
                console.warn('Error parsing removedImages', error);
            }
        }

        // Remove deleted images from server and product image array
        if (imagesToRemove && imagesToRemove.length > 0) {
          for (const img of imagesToRemove) {
              const imagePath = path.join(__dirname, '../../public/uploads/products', img);
              try {
                  // Use async/await with promises
                  await fs.unlink(imagePath).catch((error) => {
                      if (error.code !== 'ENOENT') {
                          console.warn(`Could not delete image: ${img}`, error);
                      }
                  });
              } catch (unlinkError) {
                  console.warn(`Error attempting to delete image: ${img}`, unlinkError);
              }
          }

          // Remove from product images array
          updatedImages = updatedImages.filter(img => !imagesToRemove.includes(img));
      }

        // Add new uploaded images
        if (req.files && req.files.length > 0) {
            const newImagePaths = req.files.map(file => file.filename);
            updatedImages = [...updatedImages, ...newImagePaths];
        }

        // Limit total images to 4
        updatedImages = updatedImages.slice(0, 4);

        // Prepare update data with validation
        const updateData = {
            productName: productName.trim(),
            description: description ? description.trim() : '',
            category: category.trim(),
            regularPrice: parseFloat(regularPrice) || 0,
            salePrice: parseFloat(salePrice) || 0,
            quantity: parseInt(quantity) || 0,
            color: color ? color.trim() : '',
            status: status || 'Available',
            productImage: updatedImages
        };

        // Validate numeric fields
        if (isNaN(updateData.regularPrice) || 
            isNaN(updateData.salePrice) || 
            isNaN(updateData.quantity)) {
            req.flash('error', 'Invalid numeric values');
            return res.redirect(`/admin/productsedit/${id}`);
        }

        // Validate sale price is not higher than regular price
        if (updateData.salePrice > updateData.regularPrice) {
            req.flash('error', 'Sale price cannot be higher than regular price');
            return res.redirect(`/admin/productsedit/${id}`);
        }

        // Update product
        const updatedProduct = await Product.findByIdAndUpdate(
            id, 
            updateData, 
            { 
                new: true, 
                runValidators: true 
            }
        );

        if (!updatedProduct) {
            req.flash('error', 'Failed to update product');
            return res.redirect("/admin/products");
        }

        req.flash('success', 'Product updated successfully');
        res.redirect("/admin/products");

    } catch (error) {
        console.error("Error updating product:", error);
        
        // Detailed error handling
        if (error.name === 'ValidationError') {
            req.flash('error', 'Invalid product data');
        } else if (error.name === 'CastError') {
            req.flash('error', 'Invalid product ID');
        } else {
            req.flash('error', 'An unexpected error occurred');
        }

        res.redirect(`/admin/productsedit/${req.params.id}`);
    }
};

// New method to handle product deletion

const blockProduct = async (req, res) => {
  if (req.session && req.session.admin) {
    try {
      const { id } = req.params;

      // Find the product to get the current isBlocked status
      const product = await Product.findById(id);

      if (!product) {
        return res.status(404).send("Product not found");
      }

      // Toggle the isBlocked status
      product.isBlocked = !product.isBlocked;

      // Save the updated product
      await product.save();

      console.log("Product status updated:", product);

      // Redirect back to the product list
      res.redirect("/admin/products");
    } catch (error) {
      console.error("Error blocking/unblocking product:", error);
      res.status(500).send("An error occurred while blocking/unblocking the product.");
    }
  } else {
    res.redirect("/admin/login");
  }
};


const viewProducts = async (req,res)=>{
  try {
    const {id} = req.params
    const products = await Product.findById({_id:id}).lean();
      res.render("product-view", { 
        adminName: req.session.admin.name,
        product: products 
      });
  } catch (error) {
    console.error(error)
  }
}

module.exports = {
  productInfo,
  addProducts,
  geteditProducts,
  createProduct,
  updateProduct,
  blockProduct,
  viewProducts
}