const User =require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');



const loadLogin = (req,res) =>{
  
  if(req.session.admin){

    return res.redirect("/admin/dashboard");
    
  }
  res.render("admin-login",{message:null})
}

const login = async (req,res) =>{
  try {
    const {email,password} = req.body;
    const admin = await User.findOne({email,isAdmin:true});
    if(admin){
      const passwordMatch  = await bcrypt.compare(password,admin.password);

      if(passwordMatch){
        req.session.admin = {
          name: admin.name,
          email:admin.email
        }
        return res.redirect("/admin/dashboard");
      }
      else{
        return res.render("admin-login",{message:"Invalid password"})
      }
    }else{
      return res.render("admin-login",{message:"Admin not found"});
    }

  } catch (error) {

    console.error("Login errror",error);
    return res.render("admin-login",{message:"An error Occured,Please try again"});
    
  }

}

const logout = async (req,res) =>{
  try {
    
    req.session.destroy(err =>{
      if(err){
        console.error("Error destroying session",err)
        return res.redirect("/pageerror");
      }
      res.redirect("/admin/login")
    })

  } catch (error) {

    console.error("Unexpected error during logout",error);
    res.redirect("/pageerror");
    
  }
}





module.exports =  {
  loadLogin,
  login,
  logout,
};