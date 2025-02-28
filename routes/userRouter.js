const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController");
const cartController = require("../controllers/user/cartController");
const addressController = require("../controllers/user/addressController");
const wishlistController = require("../controllers/user/wishlistController");
const checkoutController = require('../controllers/user/checkoutController');
const orderController = require('../controllers/user/orderController');
const couponController = require('../controllers/user/couponController');
const {profileImageUpload} = require("../middlewares/multer");
const {isAuth} = require('../middlewares/authMiddleware');
const paymentController = require('../controllers/user/paymentController');
const walletController = require('../controllers/user/walletController');
const { generateInvoice } = require('../helpers/orderInvoiceDownload');
const path = require('path');
const fs = require('fs');
const Coupon = require('../models/couponSchema');
const contactController = require('../controllers/user/contactController');

// Home and Authentication routes
router.get("/", userController.loadHomepage);
router.get("/signup", userController.loadsignup);
router.post("/signup", userController.signup);
router.get("/logout", userController.logOut);
router.post("/verifyOtp", userController.verifyOtp);
router.get("/signin", userController.loadsignin);
router.post("/signin", userController.signin);

// Add this after the home and authentication routes
router.get("/about", userController.loadAboutPage);

// Contact routes
router.get('/contact', contactController.getContactPage);
router.post('/contact/create', contactController.createContact);

// Profile management routes
router.get("/forgot-password", profileController.forgotpassword);
router.post("/reset-password",profileController.forgotEmailValid);
router.get("/forgot-pass-otp",profileController.renderOtpPage)
router.post("/verify-pass-Otp",profileController.verifyForgotPassOtp);
router.post("/passresendOtp",profileController.passresendOtp);
router.get("/getreset-password",profileController.resetPassword);
router.post("/reset-new-password",profileController.postNewPassword);

// Product routes 
router.get("/shop",userController.loadshopping);
router.get("/productdetails/:id",userController.loadSingleProduct);

// Cart routes
router.post('/add-to-cart', cartController.addToCart);
router.get('/cart',isAuth, cartController.getCartPage);
router.post('/cart/update', cartController.updateCartItem);
router.post('/cart/remove', cartController.removeFromCart);
router.get('/api/cart/count', isAuth, cartController.getCartCount);
router.get('/cart/details', isAuth, cartController.getCartDetails);
router.get('/cart/get-items', isAuth, checkoutController.getCartItems);
router.post('/cart/clear', isAuth, cartController.clearCart);
router.post('/checkout/cod-payment', isAuth, checkoutController.handleCodPayment);

// Wishlist routes
router.post('/toggle-wishlist', wishlistController.toggleWishlist);
router.get('/wishlist',isAuth, wishlistController.getWishlist);
router.delete('/wishlist/:productId',wishlistController.removeFromWishlist);
router.get('/api/wishlist/count', isAuth, wishlistController.getWishlistCount);

// Profile routes
router.get('/profile',isAuth,profileController.getProfile);
router.patch("/updateProfile",profileImageUpload.single("profileImage"),profileController.updateProfile);
router.get('/getChangePassword',profileController.getChangePassword);
router.post('/change-password', profileController.changePassword);

// Address Management routes
router.get('/address', isAuth, addressController.getAddress);
router.get('/addAddress', isAuth, addressController.getAddAddress);
router.get('/geteditaddress/:id', isAuth, addressController.getEditAddress);
router.post('/addressData', addressController.saveAddress);
router.delete('/deleteAddress/:id', addressController.deleteAddress);
router.post('/setDefaultAddress/:id', isAuth, addressController.setDefaultAddress);
router.post('/editAddress/:id', isAuth, addressController.editAddress);

// Checkout Address routes
router.get('/checkout/addresses', isAuth, addressController.getAddresses);
router.get('/checkout/address/add', isAuth, (req, res) => {
  req.query.checkout = 'true';
  addressController.getAddAddress(req, res);
});
router.post('/checkout/address/add', checkoutController.addNewAddress);
router.get('/checkout/address/edit/:id', isAuth, (req, res) => {
  req.query.checkout = 'true';
  addressController.getEditAddress(req, res);
});
router.post('/checkout/address/edit/:id', checkoutController.editAddress);
router.post('/checkout/address/select/:id', isAuth, addressController.selectAddress);

// Add this route for setting default address
router.post('/checkout/address/set-default/:id', checkoutController.setDefaultAddress);

// Order Management routes
router.get('/checkout',isAuth,checkoutController.getCheckoutPage);
router.post('/add-address',checkoutController.addNewAddress);

router.get('/orders',isAuth,orderController.getOrderMangement);
router.get('/orderconfirmation',isAuth,orderController.getOrderConfirmation);
router.post('/confirm-order', orderController.confirmOrder);
router.post('/orders/cancel/:id',orderController.cancelOrder);
router.post('/orders/return/:id',orderController.returnOrder);
router.get('/orders/:orderId/status',isAuth,orderController.getOrderStatus);

router.post('/initiate-payment', isAuth, orderController.initiatePayment);
router.post('/verify-payment', isAuth, orderController.verifyPayment);
router.get('/order-failure', isAuth, orderController.getOrderFailurePage);
router.post('/orders/:orderId/retry-payment', isAuth, orderController.retryPayment);
router.post('/orders/:orderId/verify-retry-payment', isAuth, orderController.verifyRetryPayment);
router.post('/orders/:orderId/abort', isAuth, orderController.abortOrder);

// Wallet management Routes 
router.get('/wallet', isAuth, walletController.getWalletPage);
router.post('/wallet/add-money', isAuth, walletController.addMoney);
router.post('/wallet/withdraw', isAuth, walletController.withdrawMoney);
router.get('/wallet/transactions', isAuth, walletController.getTransactions);

// Wallet payment route with proper error handling
router.post('/checkout/wallet-payment', isAuth, checkoutController.processWalletPayment);

// Coupon routes
router.post('/coupon/apply', isAuth, couponController.applyCoupon);
router.post('/coupon/remove', isAuth, couponController.removeCoupon);
router.get('/coupon/available', isAuth, couponController.getAvailableCoupons);
router.get('/checkout/summary', isAuth, orderController.getCheckoutSummary);

// Google OAuth routes
router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}));
router.get("/auth/google/callback", passport.authenticate("google", {failureRedirect: "/signin"}), (req,res) => {
  req.session.user = req.user;
  console.log("req.user",req.user)
  res.redirect("/");
});

router.post('/checkout/remove-coupon', checkoutController.removeCoupon);
router.get('/checkout/order-summary', checkoutController.getOrderSummary);

// Payment failure handling route
router.post('/payment/failure', isAuth, orderController.handlePaymentFailure);

// Order detail route
router.get('/orders/:orderId', isAuth, orderController.getOrderDetails);

module.exports = router;