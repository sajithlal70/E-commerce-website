
const User = require("../../models/userSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");



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
    return res.render("home")
    
  }
  catch (error){
    console.error("Home page not found!!!",error);
    res.status(500).send("Server error")
    
  }
 }

 const loadsignin = async (req,res) =>{
  try {
    return res.render('signin',{googleAuthUrl:"/auth/google",
      errorMessage:req.session.errorMessage || null
    });
  }
  catch (error) {
    console.error("Home Page not loading!",error);
    res.status(500).send('server Error');
  }
 }

 const signin = async (req, res) => {

  try {

    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {

      return res.render("signin", { errorMessage: "Invalid email or password" });

    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {

      return res.render("signin", { errorMessage: "Invalid email or password" });

    }

    req.session.user = user._id;
    return res.redirect("/");


  } catch (error) {

    console.error("Signin error", error);
    return res.render("signin", { errorMessage: "An error occurred while signing in. Please try again later." });
  
  }
};



 const loadsignup = async (req,res) =>{
  try {
    return res.render('signup');
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
        pass: process.env.NODEMAILER_PASSWORD
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

    if(password !== confirmPassword){
      return res.render("otp-page",{message:"Password's do not match"});
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

      res.render("otp-page");
      console.log("OTP sent",otp)
    
  } catch (error) {
    
    console.error("signup error",error);
    res.redirect("/pageNotFound");

  }  
 }


 const securePassword = async (password) => {
  try {
    
const passwordHash = await bcrypt.hash(password,10)

return passwordHash;

  } catch (error) {


    
  }
 }

 const verifyOtp = async (req,res)=>{
  try {
    const {otp} = req.body;
    console.log("recieved otp",otp);

    if(otp === req.session.userOtp){ 
      const user = req.session.userData
      console.log(user);
      const passwordHash = await securePassword(user.password);
      const saveUserData = new User({
        name:user.name,
        email:user.email,
        phone:user.phone,
        password:passwordHash
      });
      await saveUserData.save();
      req.session.user = saveUserData._id;
      res.json({
        success:true,redirectUrl:"/signin"
      })
    }
    else{
      res.status(400).json({success:false,message:"Invalid OTP,Please Try again"})
    }

  } catch (error) {
    console.error("Error Verifying OTP",error);
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


 const loadshopping = async (req,res) => {
  try{
    return res.render('shop');
  }
  catch (error) {
    console.error('Shopping Page not loading !!',error);
    res.status(500).send("Server Error");
  }
 }


 module.exports = {
  loadHomepage,
  pageNotFound,
  loadsignin,
  signin,
  loadsignup,
  verifyOtp,
  resendOtp,
  signup,
  loadshopping
 }