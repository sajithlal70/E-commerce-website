const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const offerController = require('../controllers/admin/offerController');
const inventoryManagement = require('../controllers/admin/inventoryManagement');
const salesReportController = require('../controllers/admin/salesReportController');
const dashboardController = require('../controllers/admin/dashboardController');
const multer = require("multer");
const {adminAuth,redirectIfLoggedIn} = require('../middlewares/authMiddleware')
const { productUpload, categoryUpload, handleMulterError } = require('../middlewares/multer');
const ImageProcessor = require("../middlewares/ImageProcessor");

const methodOverride = require('method-override');
router.use(methodOverride('_method'));

router.get("/login",redirectIfLoggedIn,adminController.loadLogin);
router.post("/login",redirectIfLoggedIn,adminController.login);
router.get("/admin/logout",adminAuth,adminController.logout);


router.get("/dashboard",adminAuth,dashboardController.getDashboard);

// Customer Management section

router.get("/users",adminAuth,customerController.customerInfo);
router.get("/users/:id",adminAuth,customerController.viewCustomer);
router.get("/blockCustomer",adminAuth,customerController.blockCustomer);
router.get("/unblockCustomer",adminAuth,customerController.unblockCustomer);

//Category Management section

router.get("/category",adminAuth,categoryController.categoryInfo);
router.post("/addCategory",adminAuth,categoryController.addCategory);
router.post("/editCategory/:id", adminAuth, categoryController.editCategory);
router.post('/toggleCategoryStatus/:id',adminAuth,categoryController.toggleCategoryStatus);


//Product Management section 

router.get("/products", adminAuth,productController.productInfo);
router.get("/addProducts", adminAuth,productController.addProducts);
router.post("/productsadd", adminAuth, productUpload, productController.createProduct);

router.get("/products/:id",adminAuth,productController.geteditProducts);
router.post("/productsedit/:id", adminAuth, productUpload, productController.updateProduct);
router.post("/products/block/:id",adminAuth,productController.blockProduct);
router.get("/products/view/:id",adminAuth,productController.viewProducts)

router.get('/order',adminAuth,orderController.getAllOrders);
router.get('/order/:id',adminAuth,orderController.getOrderDetails);
router.post('/order/:id/update-status',adminAuth,orderController.updateOrderStatus);
router.post('/order/:orderId/item/:itemId/update-status',orderController.updateOrderItemStatus);
router.post('/order/:orderId/return',adminAuth,orderController.handleReturnRequest);
router.post('/order/:orderId/item/:itemId/return-request', adminAuth, orderController.processReturnRequest);

router.get('/coupons',adminAuth,couponController.getCouponPage);
router.post('/add-coupon',couponController.createCoupon);
router.delete('/coupons-delete/:id',couponController.deleteCoupon);

router.get('/coupons/:id', couponController.getCouponById);
router.put('/coupons/:id', couponController.editCoupon);

router.get('/offers',adminAuth,offerController.getOffers);
router.get('/check-existing-offer',adminAuth,offerController.checkExistingOffer);
router.post('/offers',adminAuth,offerController.createOffer);
router.put('/edit-offer/:offerId',adminAuth,offerController.updateOffer);
router.delete('/delete-offer/:offerId',adminAuth,offerController.deleteOffer);

router.get('/api/products',adminAuth,offerController.getProducts);
router.get('/api/categories',adminAuth,offerController.getCategories);

router.get('/inventory',adminAuth,inventoryManagement.renderInventoryPage);
router.post('/inventory/update-stock/:productId', inventoryManagement.updateStock);
router.post('/inventory/soft-delete/:productId', inventoryManagement.softDeleteProduct);
router.post('/inventory/reactivate/:productId', inventoryManagement.reactivateProduct);


router.get('/reports', adminAuth,salesReportController.getReport);
router.get('/sales-report/export', adminAuth, salesReportController.exportSalesReport);

// Add error handler
router.use(handleMulterError);

module.exports = router;