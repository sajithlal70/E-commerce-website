const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const { getActiveOffersForProducts } = require('./offerHelper');

const toggleWishlist = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: "Please login to manage wishlist"
            });
        }

        const userId = req.session.user._id;
        const { productId } = req.body;

        // Validate product ID
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        // Check if product exists and is not blocked
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        if (product.isBlocked) {
            return res.status(400).json({
                success: false,
                message: "This product is currently not available"
            });
        }

        // Find user and update wishlist
        const user = await User.findById(userId);
        const isInWishlist = user.wishlist.includes(productId);

        if (isInWishlist) {
            // Remove from wishlist
            user.wishlist = user.wishlist.filter(id => id.toString() !== productId.toString());
            await user.save();
            
            res.json({
                success: true,
                inWishlist: false,
                message: "Product removed from wishlist"
            });
        } else {
            // Add to wishlist
            user.wishlist.push(productId);
            await user.save();
            
            res.json({
                success: true,
                inWishlist: true,
                message: "Product added to wishlist"
            });
        }

    } catch (error) {
        console.error("Wishlist toggle error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update wishlist"
        });
    }
};


const getWishlist = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.session.user?._id);

    if (!user) {
      return res.redirect('/signin');
    }

    const totalItems = user.wishlist.length;
    const totalPages = Math.ceil(totalItems / limit);

    const paginatedUser = await User.findById(req.session.user?._id)
      .populate({
        path: 'wishlist',
        populate: {
          path: 'category',
          model: 'Category'
        },
        options: {
          skip: skip,
          limit: limit
        }
      });

    // Get active offers for wishlist products
    const wishlistProducts = paginatedUser.wishlist;
    const offersMap = await getActiveOffersForProducts(wishlistProducts);

    // Enhance wishlist with additional product details and offers
    const enhancedWishlist = paginatedUser.wishlist.map(product => {
      const offerInfo = offersMap.get(product._id.toString()) || {
        bestOffer: 0,
        discountedPrice: product.salePrice
      };

      return {
        ...product.toObject(),
        isAvailable: product.quantity > 0 && !product.isBlocked,
        availabilityStatus: product.quantity > 0 
          ? (product.isBlocked ? 'Unavailable' : 'Available') 
          : 'Out of Stock',
        offer: offerInfo.bestOffer,
        originalPrice: product.reqularPrice,
        discountedPrice: offerInfo.discountedPrice
      };
    });

    const category = await Category.find();

    res.render('whishlist', {
      wishlist: enhancedWishlist,
      categories: category,
      user: user,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        limit: limit,
        totalItems: totalItems,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ message: 'Server error while fetching wishlist' });
  }
};




const removeFromWishlist = async (req, res) => {
  try {
      const { productId } = req.params;

      console.log(req.params);
      
      
      // Ensure user is authenticated
      if (!req.session.user) {
          return res.status(401).json({ message: 'Unauthorized' });
      }

      const userId = req.session.user._id;

      const user = await User.findById(userId);
      
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Remove product from wishlist
      user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
      
      await user.save();
      
      res.status(200).json({ message: 'Product removed from wishlist' });
  } catch (error) {
      console.error('Remove from wishlist error:', error);
      res.status(500).json({ message: 'Server error while removing from wishlist' });
  }
};

const getWishlistCount = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        const count = user ? user.wishlist.length : 0;
        
        res.status(200).json({ count });
    } catch (error) {
        console.error('Get wishlist count error:', error);
        res.status(500).json({ message: 'Error fetching wishlist count' });
    }
};

module.exports = {
  toggleWishlist,
  getWishlist,
  removeFromWishlist,
  getWishlistCount
};