const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController =require("../controllers/user/userController");
const isAuthenticated = require("../middlewares/authMiddleware")

router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage);
router.get("/signup",userController.loadsignup);
router.post("/signup",userController.signup)
router.post("/resendOtp",userController.resendOtp);
router.post("/verifyOtp",userController.verifyOtp)
router.get("/signin",userController.loadsignin);
router.post("/signin",userController.signin);
router.get("/shop",userController.loadshopping);


router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}));
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/signup"}),(req,res) =>{
  res.redirect("/");
});


 



module.exports = router;