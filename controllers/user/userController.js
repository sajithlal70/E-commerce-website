const User = require("../../models/userSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require('bcryptjs');
const Product = require("../../models/productSchema")
const Category =require("../../models/categorySchema")
const Cart = require("../../models/cartSchema");
const {calculateBestOffer} = require('../../helpers/productOfferCalculation');
const { generatePaginationLinks} = require('../../helpers/shopPagination')
const { getActiveOffersForProducts, getActiveCategoryOffers } = require('./offerHelper');
const Offer = require('../../models/offerSchema');
const mongoose = require('mongoose');


const loadHomepage = async (req, res) => {
  try {
    const user = req.user || req.session.user;
    const products = await Product.find({ isBlocked: false })
      .select('productName productImage stock quantity salePrice reqularPrice offer')
      .populate('category') // Populate category to access category offer
      .limit(8);
    
    const category = await Category.find({ status: 'Listed' });
    
    const recentProducts = await Product.find({ isBlocked: false })
      .select('productName productImage stock quantity salePrice reqularPrice offer')
      .populate('category') // Populate category to access category offer
      .sort({ createdAt: -1 })
      .limit(4);

    // Apply offer calculations to products
    const productsWithOffers = products.map(prod => {
      // Use calculateBestOffer to determine the best offer
      const { bestOffer, offerSource } = calculateBestOffer(prod);
      
      // Calculate discounted price
      const discountedPrice = bestOffer > 0 
        ? prod.salePrice - (prod.salePrice * (bestOffer / 100))
        : prod.salePrice;
        
      return {
        ...prod.toObject(),
        bestOffer,
        offerSource,
        discountedPrice
      };
    });

    // Apply offer calculations to recent products
    const recentProductsWithOffers = recentProducts.map(prod => {
      // Use calculateBestOffer to determine the best offer
      const { bestOffer, offerSource } = calculateBestOffer(prod);
      
      // Calculate discounted price
      const discountedPrice = bestOffer > 0 
        ? prod.salePrice - (prod.salePrice * (bestOffer / 100))
        : prod.salePrice;
        
      return {
        ...prod.toObject(),
        bestOffer,
        offerSource,
        discountedPrice
      };
    });

    // For categories, keep the original logic if you need to display category offers
    const categoriesWithOffers = category.map(cat => {
      return {
        ...cat.toObject(),
        offer: cat.offer || 0  // Use category offer directly if it exists
      };
    });

    if (user) {
      const currentUser = await User.findById(user._id);
      
      if (!currentUser || currentUser.IsBlocked) {
        req.session.destroy(() => {
          return res.redirect('/signin?blocked=true&message=' + encodeURIComponent('Your account has been blocked by the admin.'));
        });
        return;
      }

      return res.render("home", {
        user: currentUser, 
        products: productsWithOffers,
        categories: categoriesWithOffers,
        recentProducts: recentProductsWithOffers,
      });
    } else {
      return res.render("home", {
        user: null,
        products: productsWithOffers,
        categories: categoriesWithOffers,
        recentProducts: recentProductsWithOffers,
      });
    }
    
  } catch (error) {
    console.error("Home page not loading!!!", error);
    res.status(500).send("Server error");
  }
};

const loadsignin = async (req, res) => {
  try {
    const product = await Product.find({ isBlocked: false });
    const category = await Category.find({ status: 'Listed' });
    
    const isBlocked = req.query.blocked === 'true';
    const blockMessage = req.query.message || null;
    const errorMessage = req.session.errorMessage || null;
    
    req.session.errorMessage = null;

    return res.render('signin', {
      googleAuthUrl: "/auth/google",
      errorMessage: errorMessage || "",
      isBlocked: isBlocked,
      blockMessage: blockMessage || "",
      products: product,
      categories: category
    });
  } catch (error) {
    console.error("Home Page not loading!", error);
    res.status(500).send('server Error');
  }
}

const signin = async (req, res) => {
  try {
    const product = await Product.find({ isBlocked: false }).limit(8);
    const category = await Category.find({ status: 'Listed' });

    const { email, password } = req.body;

    // Server-side validation
    if (!email || !password) {
      req.flash("error", "Email and password are required.");
      return res.render("signin", {
        messages: req.flash(),
        product,
        category,
        googleAuthUrl: process.env.GOOGLE_AUTH_URL
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      req.flash("error", "Invalid email or password.");
      return res.render("signin", {
        messages: req.flash(),
        product,
        category,
        googleAuthUrl: process.env.GOOGLE_AUTH_URL
      });
    }

    if (!user.password) {
      req.flash("error", "Please log in with Google.");
      return res.render("signin", {
        messages: req.flash(),
        product,
        category,
        googleAuthUrl: process.env.GOOGLE_AUTH_URL
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash("error", "Invalid email or password.");
      return res.render("signin", {
        messages: req.flash(),
        product,
        category,
        googleAuthUrl: process.env.GOOGLE_AUTH_URL
      });
    }

    if (user.IsBlocked) {
      req.flash("error", "User is blocked by admin.");
      return res.render("signin", {
        messages: req.flash(),
        product,
        category,
        googleAuthUrl: process.env.GOOGLE_AUTH_URL
      });
    }

    // Set session and redirect
    req.session.user = user;
    return res.redirect("/");

  } catch (error) {
    console.error("Signin error:", error);
    req.flash("error", "An error occurred while signing in. Please try again later.");
    return res.render("signin", {
      messages: req.flash(),
      product: [],
      category: [],
      googleAuthUrl: process.env.GOOGLE_AUTH_URL
    });
  }
};


const logout = (req,res) => {
  req.session.destroy((error) =>{
    if(error){
      return res.status(500).send("could not log out");
    }
    res.redirect("/signin")
  })
};



 const loadsignup = async (req,res) =>{
  try {
    const product = await Product.find({ isBlocked: false });
    const category = await Category.find({ status: 'Listed'});
    return res.render('signup',{
      products:product,
      categories:category
    }
    );
  }
  catch (error) {
    console.error("Home Page not loading!",error);
    res.status(500).send('server Error');
  }
 }


function generateOtp(){
  
  
  let otp= Math.floor(100000 + Math.random()*900000).toString();  
  return otp
}

async function sendVerificationEmail(email,otp){
  try {

    const transporter = nodemailer.createTransport({
      service:"gmail",
      port:587,
      secure:false,
      requireTLS:true,
      auth:{
        user: process.env.NODEMAILER_EMAIL, 
        pass: process.env.NODEMAILER_PASSWORD,  

      }
    })
    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject:"Verify your account",
      text:`Your OTP is ${otp}`,
      html:`<b> Your OTP: ${otp}</b>`,
    });

    return info.accepted.length > 0

  } catch (error) {
    console.error("Error sending email",error);
    return false;
    
  }
}


 const signup = async (req,res) =>{
  try {
    const {name,email,phone,password,confirmPassword} = req.body;
    const product = await Product.find({ isBlocked: false });
    const category = await Category.find({ status: 'Listed'});

    // Input validation
    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.render("signup", {
        message: "All fields are required",
        products: product,
        categories: category
      });
    }

    // Password validation
    if(password !== confirmPassword){
      return res.render("signup", {
        message: "Passwords do not match",
        products: product,
        categories: category
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render("signup", {
        message: "Please enter a valid email address",
        products: product,
        categories: category
      });
    }

    // Phone number validation
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.render("signup", {
        message: "Please enter a valid 10-digit phone number",
        products: product,
        categories: category
      });
    }

    const findUser = await User.findOne({email});

    if(findUser){
      return res.render("signup", {
        message: "User with this email already exists",
        products: product,
        categories: category
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email,otp);

    if(!emailSent){
      return res.render("signup", {
        message: "Failed to send verification email. Please try again.",
        products: product,
        categories: category
      });
    }

    req.session.userOtp = otp;
    req.session.userData = {name,email,phone,password,confirmPassword};
  
    res.render("otp-page", {
      products: product,
      categories: category,
      email: email // Pass email to show in OTP page
    });
    console.log("OTP sent", otp);
    
  } catch (error) {
    console.error("Signup error", error);
    res.render("signup", {
      message: "An error occurred during signup. Please try again.",
      products: [],
      categories: []
    });
  }  
}


 const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error("Password hashing error:", error);
    throw error;
  }
};

 const verifyOtp = async (req,res) => {
  try {
    const {otp} = req.body;
    console.log("received otp", otp);

    if(!req.session.userOtp || !req.session.userData) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please try signing up again."
      });
    }

    if(otp === req.session.userOtp) { 
      const user = req.session.userData;
      const passwordHash = await securePassword(user.password);
      
      const userData = {
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash,
        googleId: user.googleId || null
      };

      const saveUserData = new User(userData);
      await saveUserData.save();

      // Clear sensitive session data
      delete req.session.userOtp;
      delete req.session.userData;

      res.json({
        success: true,
        message: "Account created successfully!",
        redirectUrl: "/signin"
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again."
      });
    }
  } catch (error) {
    console.error("Error Verifying OTP", error);

    if (error.code === 11000) {
      if (error.keyPattern.email) {
        return res.status(400).json({
          success: false,
          message: "Email already registered. Please try logging in."
        });
      }
      if (error.keyPattern.googleId) {
        return res.status(400).json({
          success: false,
          message: "Google account already exists. Try logging in instead."
        });
      }
    }

    res.status(500).json({
      success: false,
      message: "An error occurred. Please try again later."
    });
  }
 }

 const resendOtp = async (req,res)=>{
  try {
    if(!req.session.userData){
      return res.status(400).json({success:false,message:"Session expired.Please try again later."})
    }
    const newOtp = generateOtp();
    const emailsent = await sendVerificationEmail(req.session.userData.email,newOtp);
    if(!emailsent){
      return res.status(500).json({success:false,message:"Failed to send OTP,"});
    }

    req.session.userOtp = newOtp; 
    res.json({success:true,message:"Otp has been resend successfully."});
    console.log("new Otp:",newOtp);

  } catch (error) {
    console.error("Error resending Otp",error);
    res.status(500).json({success:false,message:"An error occured while resending Otp."})
  }
 }

const logOut = async (req,res) =>{
  req.session.destroy(() => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect('/signin');
});
};

const loadshopping = async (req, res, next) => {
  try {
      const page = parseInt(req.query.page) || 1;
      const limit = 8;
      const searchQuery = req.query.search || '';
      const category = req.query.category || '';
      const sort = req.query.sort || 'default';  // Set default sort
      const selectedPriceRange = req.query.price || 'all';
      const minPrice = parseFloat(req.query.minPrice) || 0;
      const maxPrice = parseFloat(req.query.maxPrice) || Number.MAX_SAFE_INTEGER;

      // Build query object
      let query = { isBlocked: false };

      // Add search condition if present
      if (searchQuery) {
          query.productName = { $regex: searchQuery, $options: 'i' };
      }

      // Add category filter if present and valid
      if (category) {
          if (mongoose.Types.ObjectId.isValid(category)) {
              query.category = category;
          } else {
              return res.status(404).render('404', {
                  message: 'Invalid category'
              });
          }
      }

      // Add price range filter
      if (selectedPriceRange !== 'all') {
          const [min, max] = selectedPriceRange.split('-').map(Number);
          query.salePrice = { $gte: min, $lte: max };
      } else {
          query.salePrice = { $gte: minPrice, $lte: maxPrice };
      }

      // Sort options for dropdown
      const sortOptions = [
          { value: 'default', label: 'Latest' },
          { value: 'price_desc', label: 'Price: High to Low' },
          { value: 'price_asc', label: 'Price: Low to High' },
          { value: 'name_asc', label: 'Name: A to Z' },
          { value: 'name_desc', label: 'Name: Z to A' }
      ];

      // Build sort object
      let sortQuery = {};
      switch (sort) {
          case 'price_asc':
              sortQuery = { salePrice: 1 };
              break;
          case 'price_desc':
              sortQuery = { salePrice: -1 };
              break;
          case 'name_asc':
              sortQuery = { productName: 1 };
              break;
          case 'name_desc':
              sortQuery = { productName: -1 };
              break;
          default:
              sortQuery = { createdAt: -1 };
      }

      // Define price ranges for filter
      const priceRanges = [
          { range: '0-10000', label: '₹0 - ₹10,000' },
          { range: '10000-50000', label: '₹10,000 - ₹50,000' },
          { range: '50000-100000', label: '₹50,000 - ₹1,00,000' },
          { range: '100000-500000', label: '₹1,00,000 - ₹5,00,000' },
          { range: '500000-1000000', label: '₹5,00,000 - ₹10,00,000' }
      ];

      // Get counts for each price range
      const priceRangeCounts = await Promise.all(
          priceRanges.map(async ({ range }) => {
              const [min, max] = range.split('-').map(Number);
              const count = await Product.countDocuments({
                  ...query,
                  salePrice: { $gte: min, $lte: max }
              });
              return { range, count };
          })
      );

      // Execute main queries in parallel
      const [products, totalProducts, categories] = await Promise.all([
          Product.find(query)
              .sort(sortQuery)
              .skip((page - 1) * limit)
              .limit(limit)
              .populate('category')
              .catch(err => {
                  console.error('Product query error:', err);
                  return [];
              }),
          Product.countDocuments(query).catch(err => {
              console.error('Count query error:', err);
              return 0;
          }),
          Category.find({ status: 'Listed' }).catch(err => {
              console.error('Category query error:', err);
              return [];
          })
      ]);
      console.log("categories", categories);
      
      // Calculate best offers for each product
      const productsWithOffers = products.map(product => {
          const productData = product.toObject();
          const offerDetails = calculateBestOffer(productData);
          
          // Calculate the display price after applying the best offer
          const discountAmount = (productData.salePrice * offerDetails.bestOffer) / 100;
          const displayPrice = productData.salePrice - discountAmount;
          
          return {
              ...productData,
              bestOffer: offerDetails.bestOffer,
              offerSource: offerDetails.offerSource,
              displayPrice: displayPrice
          };
      });
      
      const totalPages = Math.ceil(totalProducts / limit) || 1; 
    
      if (page > totalPages) {
          return res.redirect(`/shop?page=1${searchQuery ? `&search=${searchQuery}` : ''}${category ? `&category=${category}` : ''}`);
      }

      // Update the pagination links generation
      const paginationData = generatePaginationLinks(page, totalPages, {
          search: searchQuery,
          category,
          sort,
          price: selectedPriceRange
      });

      res.render('shop', {
          products: productsWithOffers || [], 
          categories: categories || [],
          currentPage: page,
          totalPages,
          searchQuery,
          selectedCategory: category,
          sort,
          minPrice,
          maxPrice,
          user: req.session.user || null,
          selectedPriceRange,
          priceRanges,
          priceRangeCounts: priceRangeCounts || [],
          totalProducts,
          sortOptions,
          paginationLinks: paginationData,
          limit
      });

  } catch (error) {
      console.error('Shop page error:', error);
      next(error);
  }
};


const loadSingleProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const user = req.session.user;
    
    // Fetch the product with populated category
    const product = await Product.findById(productId).populate('category');
    
    if (!product) {
      return res.status(404).render('error', {
        message: 'Product not found',
        error: 'The requested product could not be found'
      });
    }

    // Calculate stock and availability
    const currentStock = Math.max(0, Number(product.stock || product.quantity || 0));
    const maxAllowed = Math.min(5, currentStock);
    const isBlocked = Boolean(product.isBlocked);
    const isAvailable = !isBlocked && currentStock > 0;

    // Calculate best offer for the main product
    const { bestOffer, offerSource } = calculateBestOffer(product);
    
    // Apply best offer information to the product
    product.bestOffer = bestOffer;
    product.offerSource = offerSource;
    
    // Calculate discounted price if there's an offer
    if (bestOffer > 0) {
      product.discountedPrice = product.salePrice - (product.salePrice * (bestOffer / 100));
    } else {
      product.discountedPrice = product.salePrice;
    }

    // Get user's wishlist status if logged in
    let isInWishlist = false;
    if (user) {
      const userDoc = await User.findById(user._id);
      isInWishlist = userDoc.wishlist.includes(productId);
    }

    // Fetch related products - Updated query
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId }, 
      isBlocked: false,
      $or: [
        { quantity: { $gt: 0 } },
        { stock: { $gt: 0 } }
      ],
      satatus: 'Available' 
    })
    .populate('category')
    .limit(4)
    .lean(); 
    
    // Process related products to ensure consistent stock handling
    // and calculate offers for each related product
    const processedRelatedProducts = relatedProducts.map(prod => {
      // Calculate best offer for each related product
      const offerInfo = calculateBestOffer(prod);
      
      return {
        ...prod,
        currentStock: Math.max(0, Number(prod.stock || prod.quantity || 0)),
        isAvailable: !prod.isBlocked && (prod.stock > 0 || prod.quantity > 0),
        bestOffer: offerInfo.bestOffer,
        offerSource: offerInfo.offerSource,
        discountedPrice: offerInfo.bestOffer > 0 
          ? prod.salePrice - (prod.salePrice * (offerInfo.bestOffer / 100))
          : prod.salePrice
      };
    });

    // Fetch categories for navigation
    const categories = await Category.find({ status: 'Listed' });

    res.render('product-detail', {
      product,
      relatedProducts: processedRelatedProducts,
      categories,
      user,
      isInWishlist,
      maxAllowed,
      productStatus: {
        isBlocked,
        isAvailable,
        currentStock,
        maxAllowed,
        remainingStock: currentStock
      }
    });

  } catch (error) {
    console.error('Error in loadSingleProduct:', error);
    res.status(500).render('error', {
      message: 'Internal server error while loading product details',
      error: error.message
    });
  }
};

const loadAboutPage = async (req, res) => {
    try {
        // Fetch required data for the about page
        const categories = await Category.find({ isListed: true });
        const products = await Product.find({ isListed: true })
            .populate('category')
            .limit(8); // Limiting to 8 products for display

        res.render('user/about', {
            user: req.session.user,
            categories,
            products,
            title: 'About Us | DentKart'
        });
    } catch (error) {
        console.error('Error in loadAboutPage:', error);
        res.status(500).render('error', { 
            message: 'Internal server error', 
            error: error 
        });
    }
};

// Update the checkProductStock helper function
const checkProductStock = async (productId) => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      return { error: 'Product not found' };
    }
    
    // Handle both stock and quantity fields
    const stockValue = product.stock !== undefined ? product.stock : product.quantity;
    const currentStock = parseInt(stockValue) || 0;
    
    return {
      inStock: currentStock > 0,
      currentStock,
      product,
      status: currentStock > 0 ? 'instock' : 'outofstock'
    };
  } catch (error) {
    console.error('Error checking stock:', error);
    return { error: 'Error checking product stock' };
  }
};

// Update your add-to-cart route handler
const addToCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please sign in to add items to cart' 
      });
    }

    const { productId, quantity = 1 } = req.body;
    
    const stockCheck = await checkProductStock(productId);
    
    if (stockCheck.error) {
      return res.status(404).json({
        success: false,
        message: stockCheck.error
      });
    }

    if (!stockCheck.inStock) {
      return res.status(400).json({
        success: false,
        message: 'Sorry, this product is currently out of stock'
      });
    }

    if (quantity > stockCheck.currentStock) {
      return res.status(400).json({
        success: false,
        message: `Only ${stockCheck.currentStock} units available`
      });
    }

    // Add to cart logic here...
    const cart = await Cart.findOne({ user: req.session.user._id });
    
    if (!cart) {
      // Create new cart if doesn't exist
      const newCart = new Cart({
        user: req.session.user._id,
        items: [{ product: productId, quantity }]
      });
      await newCart.save();
    } else {
      // Update existing cart
      const existingItem = cart.items.find(item => 
        item.product.toString() === productId
      );

      if (existingItem) {
        if (existingItem.quantity + quantity > stockCheck.currentStock) {
          return res.status(400).json({
            success: false,
            message: `Cannot add more items. Stock limit is ${stockCheck.currentStock}`
          });
        }
        existingItem.quantity += quantity;
      } else {
        cart.items.push({ product: productId, quantity });
      }
      await cart.save();
    }

    res.json({
      success: true,
      message: 'Product added to cart successfully'
    });
    
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while adding to cart'
    });
  }
};

// Update your wishlist toggle handler
const toggleWishlist = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please sign in to manage your wishlist' 
      });
    }

    const { productId } = req.body;
    
    // Check if product exists and get stock info
    const stockCheck = await checkProductStock(productId);
    
    if (stockCheck.error) {
      return res.status(404).json({
        success: false,
        message: stockCheck.error
      });
    }

    // Optional: You can choose to allow/disallow out-of-stock items in wishlist
    // Here we're allowing them but with a warning
    const message = stockCheck.inStock ? 
      'Product updated in wishlist' : 
      'Product added to wishlist but is currently out of stock';

    // Rest of your wishlist toggle logic...
    
    res.json({
      success: true,
      message,
      inStock: stockCheck.inStock
    });
    
  } catch (error) {
    console.error('Wishlist toggle error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating wishlist'
    });
  }
};

 module.exports = {
  loadHomepage,
  loadsignin,
  signin,
  logout,
  loadsignup,
  verifyOtp,
  resendOtp,
  signup,
  loadshopping,
  loadSingleProduct,
  logOut,
  loadAboutPage,
  addToCart,
  toggleWishlist,
 }