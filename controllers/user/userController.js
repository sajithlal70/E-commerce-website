
const User = require("../../models/userSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Product = require("../../models/productSchema")
const Category =require("../../models/categorySchema")



const pageNotFound = async (req,res)=>{
  try{
    
    res.render("page-404")

  }
  catch(error){
   res.redirect("/pageNotFound") 

  }
}

const loadHomepage = async (req,res) => {
  try{
   
    const user = req.user || req.session.user;
    const product = await Product.find({isBlocked:false});
    const category = await Category.find();
    
    if(user){
      return res.render("home",{user,
        products:product,
        categories:category
      })
    }
    else{
      return res.render("home",{user:null,
        products:product,
        categories:category
      });
    }
    
  }
  catch (error){
    console.error("Home page not found!!!",error);
    res.status(500).send("Server error")
    
  }
 }

 const loadsignin = async (req,res) =>{
  try {
    const product = await Product.find();
    const category = await Category.find();
    return res.render('signin',{googleAuthUrl:"/auth/google",
      errorMessage:req.session.errorMessage || null,
      products:product,
      categories:category
      
    });
  }
  catch (error) {
    console.error("Home Page not loading!",error);
    res.status(500).send('server Error');
  }
 }



 const signin = async (req, res) => {

  try {

    const product = await Product.find();
    const category = await Category.find();

    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("signin", { errorMessage: "Email and password are required.",googleAuthUrl: process.env.GOOGLE_AUTH_URL ,
        products:product,
        categories:category
      });
    }

    const user = await User.findOne({ email });

    if (!user) {

      return res.render("signin", { errorMessage: "Invalid email or password",googleAuthUrl: process.env.GOOGLE_AUTH_URL ,
        products:product,
        categories:category
      });

    }

    if (!user.password) {
      console.error("User password is missing in the database.");
      return res.render("signin", { errorMessage: "Invalid email or password.",googleAuthUrl: process.env.GOOGLE_AUTH_URL ,
        products:product,
        categories:category
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {

      return res.render("signin", { errorMessage: "Invalid email or password" ,googleAuthUrl: process.env.GOOGLE_AUTH_URL,
        products:product,
        categories:category
      });

    }

    req.session.user = user;

    if(user.IsBlocked === true ){
      return res.render("signin", { errorMessage: "User is Blocked By Admin" ,googleAuthUrl: process.env.GOOGLE_AUTH_URL,
        products:product,
        categories:category
      });
    }
    
    return res.redirect("/");

  } catch (error) {

    console.error("Signin error", error);
    return res.render("signin", { errorMessage: "An error occurred while signing in. Please try again later.",googleAuthUrl: process.env.GOOGLE_AUTH_URL });
  
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
    const product = await Product.find();
    const category = await Category.find();
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
    const {name,email,phone,password,confirmPassword} = req.body ;
    const product = await Product.find();
    const category = await Category.find();

    if(password !== confirmPassword){
      return res.render("otp-page",{message:"Password's do not match",
      });
    }
    const findUser = await User.findOne({email});

    if(findUser){
      return res.render("signup",{message:"User with this email alrady exists"});
    }
      const otp = generateOtp();

      const emailSent = await sendVerificationEmail(email,otp);

      if(!emailSent){
        return res.json("email-error")
      }
      req.session.userOtp = otp;
      req.session.userData = {name,email,phone,password,confirmPassword};
    
      res.render("otp-page",{
        products:product,
        categories:category
      });
      console.log("OTP sent",otp)
    
  } catch (error) {
    
    console.error("signup error",error);
    res.redirect("/pageNotFound");

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

 const verifyOtp = async (req,res)=>{
  try {
    const {otp} = req.body;
    console.log("recieved otp",otp);

    if(otp === req.session.userOtp){ 
      const user = req.session.userData
      console.log(user);
      const passwordHash = await securePassword(user.password);
      const userData = {
        name:user.name,
        email:user.email,
        phone:user.phone,
        password:passwordHash,
      };
      if (user.googleId) {
        userData.googleId = user.googleId;
      }
      const saveUserData = new User(userData);
      await saveUserData.save();
      req.session.user = saveUserData._id;

       const verifyOtp = async (req,res)=>{
  try {
    const {otp} = req.body;
    console.log("recieved otp",otp);

    if(otp === req.session.userOtp){ 
      const user = req.session.userData
      console.log(user);
      const passwordHash = await securePassword(user.password);
      const userData = {
        name:user.name,
        email:user.email,
        phone:user.phone,
        password:passwordHash,
      };
      if (user.googleId) {
        userData.googleId = user.googleId;
      }
      const saveUserData = new User(userData);
      await saveUserData.save();
      req.session.user = saveUserData._id;

      res.json({
        success:true,redirectUrl:"/signin"
      })
    }
    else{
      res.status(400).json({success:false,message:"Invalid OTP,Please Try again"
      })
    }

  } catch (error) {
    console.error("Error Verifying OTP",error);

    if (error.code === 11000 && error.keyPattern.googleId) {
      return res.status(400).json({
        success: false,
        message: "Google account already exists. Try logging in instead.",
      });
    }

    res.status(500).json({success:false,message:"An error Occured"})
    
  }
 }
      res.json({
        success:true,redirectUrl:"/signin"
      })
    }
    else{
      res.status(400).json({success:false,message:"Invalid OTP,Please Try again"})
    }

  } catch (error) {
    console.error("Error Verifying OTP",error);

    if (error.code === 11000 && error.keyPattern.googleId) {
      return res.status(400).json({
        success: false,
        message: "Google account already exists. Try logging in instead.",
      });
    }

    res.status(500).json({success:false,message:"An error Occured"})
    
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


const loadshopping = async (req, res) => {
  try {
    const user = req.user || req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    // Sorting options
    const sortOption = req.query.sort || 'default';
    let sortCriteria = {};

    // Define sorting logic
    switch (sortOption) {
      case 'price_high_low':
        sortCriteria = { salePrice: -1 }; // High to low
        break;
      case 'price_low_high':
        sortCriteria = { salePrice: 1 }; // Low to high
        break;
      case 'name_asc':
        sortCriteria = { productName: 1 }; // Aa-Zz
        break;
        case 'name_desc':
        sortCriteria = { productName: -1 }; // Zz-Aa
        break;
      default:
        sortCriteria = { createdAt: -1 }; // Default to newest first
    }

    // Find total products with applied filters
    const totalProducts = await Product.countDocuments({ isBlocked: false });

    // Fetch products with sorting and pagination
    const products = await Product.find({ isBlocked: false })
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit);

    const category = await Category.find();
    const totalPages = Math.ceil(totalProducts / limit);

    if (user) {
      return res.render("shop", {
        user,
        products: products,
        categories: category,
        currentPage: page,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        currentSort: sortOption
      });
    } else {
      return res.render("shop", {
        user: null,
        products: products,
        categories: category,
        currentPage: page,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        currentSort: sortOption
      });
    }
  } catch (error) {
    console.error('Shopping Page not loading !!', error);
    res.status(500).send("Server Error");
  }
};

 const loadSingleProduct = async (req,res) =>{
  const user = req.user || req.session.user;
  try {
    const { id } = req.params;
    const product = await Product.findById({_id:id})
    const category = await Category.find();
    console.log("ph",product);
    if(user){
      return res.render("product-Detail",{
        user,
        product:product,
        categories:category
        
      });
    }
    else{
      return res.render("product-Detail",{
        user:null,
        product:product,
        categories:category
        
      });
    }

    

  } catch (error) {
    console.error("error while loading single product page",error)
  }
 }


 module.exports = {
  loadHomepage,
  pageNotFound,
  loadsignin,
  signin,
  logout,
  loadsignup,
  verifyOtp,
  resendOtp,
  signup,
  loadshopping,
  loadSingleProduct,
 }