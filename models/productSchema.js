const mongoose =  require("mongoose");
const {Schema} = mongoose; 

const productSchema = new Schema({
  productName : {
    type:String,
    required:true
  },
  description: {
    type:String,
    required:true
  },
  category : {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required:true
  },
  reqularPrice: {
    type: Number,
    required:true
  },
  salePrice: {
    type: Number,
    required:true
  },
  productOffer :{
    type: Number,
    default:0,
  },
  quantity : {
    type: Number,
    default: 0
  },
  color: {
    type:String,
    required:true
  },
  productImage : {
    type:[String],
    required:true
  },
  isBlocked :{
    type:Boolean,
    default : false
  },
  reviews: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
      comment: { type: String, required: true },
      rating: { type: Number, required: true, min: 1, max: 5 },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  status: {
    type: String,
    enum: ["Available", "out of stock", "Discontinued"],
    required: true,
    default: "Available"
  }
},{timestamps:true});
 
const Product = mongoose.model("Product",productSchema);


module.exports = Product ; 