const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController =require("../controllers/user/userController");
const {userAuth,adminAuth} = require("../middlewares/authMiddleware");


router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage);


router.get("/signup",userController.loadsignup);
router.post("/signup",userController.signup)
router.post("/resendOtp",userController.resendOtp);
router.post("/verifyOtp",userController.verifyOtp)
router.get("/signin",userController.loadsignin);
router.post("/signin",userController.signin);

//Product routes 

router.get("/shop",userAuth,userController.loadshopping);
router.get("/productdetails/:id",userAuth,userController.loadSingleProduct);


router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}));
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/signin"}),(req,res) =>{
  res.redirect("/");
});


 



module.exports = router;