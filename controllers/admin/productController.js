const Product =  require("../../models/productSchema");
const Category =require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Offer = require("../../models/offerSchema")
const fs = require('fs').promises;
const path = require("path");
const sharp =require("sharp");

const productInfo = async (req, res) => {
  if (req.session && req.session.admin) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;

      const category = await Category.find({ status: "Listed" });
      const totalProducts = await Product.countDocuments({});
      const products = await Product.find({})
        .populate('category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Apply offers to each product
      const productsWithOffers = await Promise.all(products.map(async (product) => {
        try {
          const offerDetails = await applyOffers(product);
          return {
            ...product,
            reqularPrice: offerDetails.regularPrice,
            salePrice: offerDetails.salePrice,
            productOffer: offerDetails.productOffer || 0,
            offerType: offerDetails.offerType,
            satatus: product.quantity > 0 ? 'Available' : 'Out of Stock'
          };
        } catch (error) {
          console.warn(`Error applying offers for product ${product._id}:`, error);
          return {
            ...product,
            productOffer: 0,
            offerType: null,
            satatus: product.quantity > 0 ? 'Available' : 'Out of Stock'
          };
        }
      }));

      const totalPages = Math.ceil(totalProducts / limit);

      res.render("products", {
        cat: category,
        adminName: req.session.admin.name,
        products: productsWithOffers,
        totalPages,
        currentPage: page,
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
        const { 
            productName, 
            description,  
            category, 
            reqularPrice, 
            salePrice, 
            quantity, 
            color, 
            satatus 
        } = req.body;

        // Backend validation
        const errors = {};

        if (!productName || productName.trim().length < 3) {
            errors.productName = 'Product name must be at least 3 characters long';
        }

        if (!description || description.trim().length < 10) {
            errors.description = 'Description must be at least 10 characters long';
        }

        if (!category) {
            errors.category = 'Category is required';
        }

        if (!reqularPrice || parseFloat(reqularPrice) <= 0) {
            errors.reqularPrice = 'Regular price must be greater than 0';
        }

        if (!salePrice || parseFloat(salePrice) <= 0) {
            errors.salePrice = 'Sale price must be greater than 0';
        }

        if (parseFloat(salePrice) >= parseFloat(reqularPrice)) {
            errors.salePrice = 'Sale price must be less than regular price';
        }

        if (!quantity || parseInt(quantity) < 1) {
            errors.quantity = 'Quantity must be at least 1';
        }

        if (!color || color.trim().length < 2) {
            errors.color = 'Color is required';
        }

        if (!req.files || req.files.length === 0) {
            errors.images = 'At least one product image is required';
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                errors
            });
        }

        const productImages = req.files.map(file => file.filename);

        const productOffer = reqularPrice > 0 
            ? Math.round(((reqularPrice - salePrice) / reqularPrice) * 100) 
            : 0;

        // Find category by name
        const existingCategory = await Category.findOne({ name: category });
        if (!existingCategory) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category'
            });
        }

        const newProduct = new Product({
            productName: productName.trim(),
            description: description.trim(),
            category: existingCategory._id,
            reqularPrice: parseFloat(reqularPrice),
            salePrice: parseFloat(salePrice),
            productOffer,
            quantity: parseInt(quantity),
            color: color.trim(),
            productImage: productImages,
            satatus: parseInt(quantity) > 0 ? 'Available' : 'out of stock'
        });
        
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
        const adminName = req.session.admin.name;
        
        // Fetch the product with populated category
        const product = await Product.findById(id).populate('category');

        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }

        // Fetch categories 
        const categories = await Category.find({ status: "Listed" });

        res.render("edit-product", { 
            product,
            adminName,
            categories,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error("Error fetching product for editing:", error);
        req.flash('error_msg', 'Error loading product');
        res.redirect('/admin/products');
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
        
        // Backend validation
        const errors = {};

        if (!productName || productName.trim().length < 3) {
            errors.productName = 'Product name must be at least 3 characters long';
        }

        if (!description || description.trim().length < 10) {
            errors.description = 'Description must be at least 10 characters long';
        }

        if (!category) {
            errors.category = 'Category is required';
        }

        if (!regularPrice || parseFloat(regularPrice) <= 0) {
            errors.regularPrice = 'Regular price must be greater than 0';
        }

        if (!salePrice || parseFloat(salePrice) <= 0) {
            errors.salePrice = 'Sale price must be greater than 0';
        }

        if (parseFloat(salePrice) >= parseFloat(regularPrice)) {
            errors.salePrice = 'Sale price must be less than regular price';
        }

        if (!quantity || parseInt(quantity) < 0) {
            errors.quantity = 'Quantity cannot be negative';
        }

        if (!color || color.trim().length < 2) {
            errors.color = 'Color is required';
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        let updatedImages = existingProduct.productImage || [];

        // Handle removed images
        if (removedImages) {
            try {
                const imagesToRemove = JSON.parse(removedImages);
                for (const img of imagesToRemove) {
                    try {
                        const imagePath = path.join(__dirname, '../../public/uploads/products', img);
                        await fs.unlink(imagePath);
                    } catch (unlinkError) {
                        console.warn(`Could not delete image file: ${img}`, unlinkError);
                    }
                }
                updatedImages = updatedImages.filter(img => !imagesToRemove.includes(img));
            } catch (parseError) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid removed images data'
                });
            }
        }

        // Add new images
        if (req.files && req.files.length > 0) {
            const newImagePaths = req.files.map(file => file.filename);
            updatedImages = [...updatedImages, ...newImagePaths];
        }

        // Validate total images count
        if (updatedImages.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Product must have at least one image'
            });
        }

        if (updatedImages.length > 4) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 4 images allowed'
            });
        }

        const updateData = {
            productName: productName.trim(),
            description: description ? description.trim() : '',
            category: category,
            reqularPrice: parseFloat(regularPrice) || 0,
            salePrice: parseFloat(salePrice) || 0,
            quantity: parseInt(quantity) || 0,
            color: color ? color.trim() : '',
            status: status || (parseInt(quantity) > 0 ? 'Available' : 'Out of Stock'),
            productImage: updatedImages
        };

        const updatedProduct = await Product.findByIdAndUpdate(
            id, 
            updateData, 
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(400).json({
                success: false,
                message: 'Failed to update product'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            product: updatedProduct
        });

    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating the product',
            error: error.message
        });
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


const viewProducts = async (req, res) => {
  try {
    const {id} = req.params;
    const products = await Product.findById({_id:id})
      .populate('category')  
      .lean();
    
    res.render("product-view", { 
      adminName: req.session.admin.name,
      product: products 
    });
  } catch (error) {
    console.error(error);
  }
};


const calculateDiscountedPrice = (originalPrice, discount) => {
  const discountAmount = (originalPrice * discount) / 100;
  return Math.round((originalPrice - discountAmount) * 100) / 100;
};



const applyOffers = async (product) => {
  try {
    // Find active product-specific offer
    const productOffer = await Offer.findOne({
      type: 'product',
      reference: product._id,
      status: 'active',
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    });

    // Find active category offer
    const categoryOffer = await Offer.findOne({
      type: 'category',
      reference: product.category._id, // Make sure to use category._id
      status: 'active',
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    });

    // Default values from product
    let finalPrice = product.salePrice || product.reqularPrice;
    let appliedDiscount = 0;
    let offerType = null;

    // Compare and apply the better discount
    if (productOffer && categoryOffer) {
      // Apply the higher discount
      if (productOffer.discount > categoryOffer.discount) {
        appliedDiscount = productOffer.discount;
        offerType = 'product';
      } else {
        appliedDiscount = categoryOffer.discount;
        offerType = 'category';
      }
    } else if (productOffer) {
      appliedDiscount = productOffer.discount;
      offerType = 'product';
    } else if (categoryOffer) {
      appliedDiscount = categoryOffer.discount;
      offerType = 'category';
    }

    // Calculate final price with discount
    if (appliedDiscount > 0) {
      finalPrice = calculateDiscountedPrice(product.reqularPrice, appliedDiscount);
    }

    // Update the product with new offer details
    if (appliedDiscount > 0) {
      await Product.findByIdAndUpdate(product._id, {
        productOffer: appliedDiscount,
        salePrice: finalPrice
      });
    }

    return {
      regularPrice: product.reqularPrice,
      salePrice: finalPrice,
      productOffer: appliedDiscount,
      offerType: offerType
    };
  } catch (error) {
    console.error('Error applying offers:', error);
    // Return original product prices if there's an error
    return {
      regularPrice: product.reqularPrice,
      salePrice: product.salePrice || product.reqularPrice,
      productOffer: 0,
      offerType: null
    };
  }
};


const scheduleOfferUpdates = () => {
  setInterval(async () => {
    try {
      await updateOfferStatuses();
      const products = await Product.find({});
      for (const product of products) {
        await applyOffers(product);
      }
    } catch (error) {
      console.error('Error in scheduled offer updates:', error);
    }
  }, 60000); 
};

module.exports = {
  productInfo,
  addProducts,
  geteditProducts,
  createProduct,
  updateProduct,
  blockProduct,
  viewProducts
}