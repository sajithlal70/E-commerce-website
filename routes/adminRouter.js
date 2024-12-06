const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const {userAuth,adminAuth} = require("../middlewares/authMiddleware");
const multer = require("multer");
const upload = require('../middlewares/multer');

// Configure multer for file uploads


router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/dashboard",adminController.loadDashboard);
router.get("/admin/logout",adminController.logout);

// Customer Management section

router.get("/users",adminAuth,customerController.customerInfo);
router.get("/blockCustomer",adminAuth,customerController.blockCustomer);
router.get("/unblockCustomer",adminAuth,customerController.unblockCustomer);

//Category Management section

router.get("/category",adminAuth,categoryController.categoryInfo);
router.post("/addCategory",adminAuth,categoryController.addCategory);
router.post("/editCategory/:id", adminAuth, categoryController.editCategory);
router.get("/toggleCategoryStatus/:id", adminAuth, categoryController.toggleCategoryStatus);


//Product Management section 

router.get("/products", productController.productInfo);
router.get("/addProducts", adminAuth, productController.addProducts);
router.post("/productsadd",  adminAuth,  upload.array('productImages', 4),  productController.createProduct);

router.get("/products/:id", productController.geteditProducts);
router.post("/productsedit/:id", upload.array('productImages', 4), productController.updateProduct);
router.post("/products/block/:id", productController.blockProduct);

router.get("/products/view/:id",productController.viewProducts)

module.exports = router;