
const mongoose =  require("mongoose");
const {Schema} = mongoose; 

const userSchema = new Schema ({
  name: {
    type: String,
     required: true
  },
  email: {
    type:String,
    required:true,
    unique:true
  },
  phone: {
    type:String,
    required:false,
    unique:true,
    sparse:true,
    default:null
  },
  password:{
    type:String,
    required:false,
  },
  googleId:{
    type:String,
    sparse:true
  },
  IsBlocked: {
    type:Boolean,
    default:false
  },
  isAdmin: {
    type:Boolean,
    default:false
  },
  cart: [{
    type: Schema.Types.ObjectId,
    ref:"Cart",  
  }],
  wallet: {
    type:Number,
    default:0
  },
  wishlist:[{
    type: Schema.Types.ObjectId,
    ref:"Wishlist"
  }],
  orderHistory:[{
    type: Schema.Types.ObjectId,
    ref:"Order"
  }],
  createdOn : {
    type:Date,
    default: Date.now
  },
  referalCode:{
    type:String,
    // required: true
  },
  redeemed: {
    type: Boolean
  },
  redeemedUsers: [{
    type: Schema.Types.ObjectId,
    ref: "User",
    // required: true
  }],
  searchHistory: [{
    category:{
      type: Schema.Types.ObjectId,
      ref: "Category"
    },
    brand: {
      type: String
    },
    searchOn : {
      type:Date,
      default: Date.now
    }
  }],
    resetToken: {
      type: String,
      default: null
    },
    resetTokenExpiry: {
      type: Date,
      default: null
    },
    rememberedToken: {
      type: String,
      default: null
    }
  

})




const User = mongoose.model("User",userSchema);
module.exports = User ; 