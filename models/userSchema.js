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

  userimage: {
    type:String,
    required:false,
     default: "",
  },
  phone: {
    type:String,
    required:false
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
  walletTransactions: [{
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: String,
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  wishlist:[{
    type: Schema.Types.ObjectId,
    ref:"Product"
  }],
  orderHistory:[{
    type: Schema.Types.ObjectId,
    ref:"Order"
  }],
  usedCoupons: [{
    coupon: {
      type: Schema.Types.ObjectId,
      ref: "Coupon"
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
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
    passwordChangedAt: { 
      type: Date, default: null 
    },
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
    },
    address: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address',
      },
    ],
  

})




const User = mongoose.model("User",userSchema);
module.exports = User ; 