const mongoose = require("mongoose");
const {Schema} = mongoose ;
const { v4:uuidv4} = require("uuid");


const orderSchema = new Schema ({

  orderId : {
    type:String,
    default : ()=>uuidv4(),
    unique :thrue
  },
  orderItems :[ {
    product :{
      type : Schema.Types.ObjectId,
      ref: "Product",
      required : true
    },
    quantity : {
      type : Number,
      required :true
    },
    price : {
      tyepe : Number,
      default : 0 
    }
  }],
  totalprice : {
    type : Number,
    required :true
  },
  discount : {
    type : Number,
    default : 0
  },
  finalAmount :{
    type :Number,
    required :true
  },
  address : {
    type: Schema.Types.ObjectId,
    ref :"User",
    required :true
  },
  inVoiceDate :{
    type : Date
  },
  status : {
    type :String,
    required : true,
    enum :[ "pending","Proccessing","Shipped","Delivered","Cancelled","Return Request","Return"]
  },
  createdOn : {
    type : Date,
    default : Date.now,
    requuired : true , 
  },
  couponApplied : {
    type : Boolean,
    default : false
  }

})

const Order = mongoose.model("Order",orderSchema);
module.exports = Order ;  