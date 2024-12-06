const { CURSOR_FLAGS } = require("mongodb");
const User = require("../models/userSchema");

const userAuth =(req,res,next) => {
  if(req.session.user){
    User.findById(req.session.user)
    .then(data => {
      if(data && !data.IsBlocked){
        next();
      }
      else{
        return res.redirect("/signin");
      }
    }).catch(error => {
      console.error("Error in user auth middle ware",error);
      res.status(500).send("Internal Server Error")
    })
  }
  else{
    res.redirect("/");
  }

};


// const Uauth = async (req,res, next) =>{
//   try {
//     if(req.session.user){
//       next()
//     }else{
//       res.redirect("/signin")
//     }
//   } catch (error) {
//     console.log(error);
    
//   }
// } 



// const userAuth = async (req, res, next) => {
//   try {
//     // Check if user is logged in
//     if (!req.session.user) {
//       return res.redirect('/');
//     }

//     // Find user and check authentication status
//     const user = await User.findById(req.session.user);

//     // Comprehensive user validation
//     if (!user) {
//       // Clear invalid session
//       req.session.destroy();
//       return res.redirect('/signin');
//     }

//     // Check if user is blocked
//     if (user.isBlocked) {
//       req.session.destroy(); // Clear session for blocked users
//       return res.status(403).redirect('/blocked');
//     }

//     // Optionally, add additional checks like account status, permissions, etc.
//     if (!user.isActive) {
//       return res.status(403).redirect('/account-inactive');
//     }

//     // User is authenticated, proceed to next middleware
//     next();
//   } catch (error) {
//     console.error('Error in user authentication middleware:', error);
    
//     // More informative error handling
//     if (error.name === 'CastError') {
//       // Invalid user ID format
//       req.session.destroy();
//       return res.status(400).redirect('/signin');
//     }

//     // Generic server error
//     res.status(500).send('Authentication service unavailable');
//   }
// };

const adminAuth = (req,res,next)=>{
  User.findOne({isAdmin:true})
  .then(data =>{
    if(data){
      next();
    }else{
      res.redirect("/admin/login")
    }
  }).catch(error => {
    console.error("Error in adminAuth middleWare",error);
    res.status(500).send("Internal server Error")
  })
}

module.exports = {
  userAuth,
  adminAuth,
  
};