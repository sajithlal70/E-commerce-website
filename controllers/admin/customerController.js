const User = require("../../models/userSchema");

const customerInfo = async (req,res) => {
  try {
    
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }
    let search = '';
    if(req.query.search){
      search = req.query.search;
    }
    let page = 1 ;
    if(req.query.page){
      page = parseInt(req.query.page);
    }
    const limit = 3 ;
    const userData = await User.find({
      isAdmin:false,
      $or : [
        {name:{$regex:".*"+search+".*",$options: "i"}},
        {email:{$regex:".*"+search+".*",$options: "i"}}
      ],
    })
    .limit(limit*1)
    .skip((page-1)*limit)
    .exec();

    const count  = await User.find({
      isAdmin:false,
      $or : [
        {name:{$regex:".*"+search+".*",$options: "i"}},
        {email:{$regex:".*"+search+".*",$options: "i"}}
      ],
    }).countDocuments();
  
    const adminName = req.session.admin.name;
    res.render("customers",{
      data:userData,
      totalPages: Math.ceil(count/limit),
      currentPages:page,
      search,
      adminName,
      error:null
    })
  } catch (error) {
    console.error("Error fetching customer info:", error);
    return res.render("admin/customers", {
      users: [],
      totalPages: 0,
      currentPages: 1,
      search: '',
      adminName: req.session.admin ? req.session.admin.name : '',
      error: "An error occurred while fetching customer information."
    });
  }
}


const blockCustomer = async (req,res) => {
  try {
    const id = req.query.id
    await User.updateOne({_id:id},{$set:{IsBlocked:true}});
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error blocking customer:",error);
    res.status(500).json({error:"Failed to block customer"}); 
  }
};


const unblockCustomer = async (req,res) => {
  try {
    const id = req.query.id;
    await User.updateOne({_id:id},{$set:{IsBlocked:false}})
    res.redirect("/admin/users");
    }
  catch (error) {
    console.error("error unblocking customer",error);
    res.status(500).json({error:"Failed to unblock customer"});
    
  }
}



module.exports = { 
  customerInfo,
  blockCustomer,
  unblockCustomer,
}