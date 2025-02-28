const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema")
const Category = require("../../models/categorySchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const env = require("dotenv");
const session = require("express-session");
const router = require("../../routes/userRouter");



function generateOtp() {
  const digits = "1234567890";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  } 
  return otp;
}


const sendVerificationEmail = async (email,otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service:"gmail",
      port:578,
      secure:false,
      auth:{
        user : process.env.NODEMAILER_EMAIL,
        pass : process.env.NODEMAILER_PASSWORD,
      }
    })

    const mailOptions = {
      from : process.env.NODEMAILER_EMAIL, 
      to : email,
      subject:"Your Otp for password reset",
      text:`Your Otp is ${otp}`,
      html:`<b><h4>Your OTP: ${otp}`
    }
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent :",info.messageId);
    return true;
    
  } catch (error) {
    console.error("Error sending email",error);
    return false;
  }
}

const securePassword = async (password) => {
 const passwordHash = await bcrypt.hash(password,10);
 return passwordHash;
}

const forgotpassword = async (req,res) =>{
  try {
    const product = await Product.find();
    const category = await Category.find();
    res.render('forgot-password',{
      products:product,
      categories:category
    })
  } catch (error) {
    console.error("Error Loding forgot password page");
  }
}

const verifyForgotPassOtp = async(req,res) => {
  try {
    
    const enteredOtp = req.body.otp;

    console.log("entered otp",enteredOtp);
    
    if(enteredOtp === req.session.userOtp){
      res.json({success:true,redirectUrl:"/getreset-password"})
    }
    else{
      res.json({success:false,message:"Otp not Matching"})
    }

  } catch (error) {

    res.status(500).json({success:false,message:"An error occured.Please try again"});
    
  }
}


const forgotEmailValid = async (req,res) => {
  try {
    const product = await Product.find();
    const category = await Category.find();

    const {email} = req.body ;
    console.log(email)
    const findUser = await User.findOne({email:email});

    if(findUser){
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email,otp) ;
      if(emailSent){
        req.session.userOtp = otp;
        console.log("Otp",otp);
        
        req.session.email = email
        res.render("forgotPassOtp",{
          products:product,
          categories:category

      })
      }
    }
  } catch (error) {
    console.error("Error Loding change password page");
  }
}


const renderOtpPage = async (req, res) => {
  try {
    const product = await Product.find();
    const category = await Category.find();
    res.render('forgotPassOtp', {
      products: product,
      categories: category
    });
  } catch (error) {
    console.error("Error rendering OTP page", error);
    res.status(500).send("Internal Server Error");
  }
}

const passresendOtp = async (req,res)=>{
  try {
    console.log("Session email:", req.session.email);
    console.log("Existing session OTP:", req.session.userOtp);
    if(!req.session.email){
      return res.status(400).json({success:false,message:"Session expired.Please try again later."})
    }
    const newOtp = generateOtp();
    const emailsent = await sendVerificationEmail(req.session.email,newOtp);
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

const resetPassword = async (req,res) => {
  try {
    const product = await Product.find();
    const category = await Category.find();   
    res.render("reset-password",{
      products:product,
      categories:category
    }

    );

  } catch (error) {

    console.error("rest password page loading error")
    
  }
}


const postNewPassword = async (req, res) => {
  try {
      console.log('Full Request Body:', req.body);
      console.log('Session Data:', req.session);

      const { newPass1, newPass2 } = req.body;
      const email = req.session.email;

      console.log("Received Data:", {
          email,
          newPass1,
          newPass2
      });

      // Comprehensive validation
      if (!email) {
          return res.status(400).render('getreset-password', { 
              message: "No email found in session. Please restart reset process." 
          });
      }

      if (!newPass1 || !newPass2) {
          return res.status(400).render('getreset-password', { 
              message: "Both password fields are required" 
          });
      }

      if (newPass1 !== newPass2) {
          return res.status(400).render('getreset-password', { 
              message: "Passwords do not match" 
          });
      }

      // Password strength regex
      const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]).{8,}$/;
      
      if (!passwordStrengthRegex.test(newPass1)) {
          return res.status(400).render('getreset-password', { 
              message: "Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character" 
          });
      }

      // Hash password
      const passwordHash = await securePassword(newPass1);

      // Update user password
      const updateResult = await User.findOneAndUpdate(
          { email: email },
          { password: passwordHash },
          { new: true }
      );

      console.log("Password Update Result:", updateResult);

      if (!updateResult) {
          return res.status(404).render('getreset-password', { 
              message: "User not found" 
          });
      }

      // Clear session email
      req.session.email = null;

      // Redirect to login
      res.redirect("/signin");

  } catch (error) {
      console.error("Change password error:", error);
      res.status(500).render('getreset-password', { 
          message: "An unexpected error occurred. Please try again." 
      });
  }
}


const getProfile = async (req, res) => {
  try {
    const product = await Product.find();
    const category = await Category.find();
    const userId = req.session.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Fetch the user's addresses
    const userAddresses = await Address.findOne({ userId });
    let defaultAddress = null;

    // Check if any address is marked as default
    if (userAddresses && userAddresses.address) {
      defaultAddress = userAddresses.address.find(addr => addr.default);
    }

    res.render('profile', {
      products: product,
      categories: category,
      user: user,
      addresses: {
        address: userAddresses ? userAddresses.address : [],
        defaultAddress: defaultAddress || null,
      },
    });
  } catch (error) {
    console.error("Error loading profile page", error);
    res.status(500).send("Internal Server Error");
  }
};



const updateProfile = async (req, res) => {
  try {
      const updates = req.body;
      const userId = req.session.user._id;

      // Find the user
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ success: false, message: "User not found." });
      }
      // Update other profile fields
      Object.assign(user, updates);
      const updatedUser = await user.save();

      return res.json({
          success: true,
          message: "Profile updated successfully",
          data: {
              name: updatedUser.name,
              email: updatedUser.email,
          }
      });
  } catch (error) {
      console.error("Error updating profile:", error);
      return res.status(500).json({ 
          success: false, 
          message: error.message || "Server error" 
      });
  }
};


const getChangePassword = async (req, res) => {
  try {
    const product = await Product.find();
    const category = await Category.find();
   
    const user = await User.findById(req.session.user._id); 

    res.render('change-password', {
      products: product,
      categories: category,
      user: user, 
    });
  } catch (error) {
    console.error("Loading change password page error", error);
    res.status(500).send("Internal Server Error");
  }
};



const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Find the user
    const user = await User.findById(req.session.user._id);

    // Check if the current password matches
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Check if new password and confirm password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirm password do not match' });
    }

    // Hash the new password and update the user record
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Update the passwordChangedAt field
    user.passwordChangedAt = Date.now();

    // Save the updated user
    await user.save();

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};







module.exports = {
  forgotpassword,
  forgotEmailValid,
  renderOtpPage,
  passresendOtp,
  verifyForgotPassOtp,
  resetPassword,
  postNewPassword,
  getProfile,
  updateProfile,
  getChangePassword,
  changePassword,
}