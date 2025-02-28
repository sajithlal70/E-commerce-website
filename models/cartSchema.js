const mongoose = require("mongoose");
const {Schema} = mongoose ;


const CartSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 1
    },
    images:{
      type:[String],
      required:true
    },

    // price: {
    //   type: Number,
    //   required: true
    // }
  }],
  totalPrice: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

const Cart = mongoose.model("Cart", CartSchema);

module.exports = Cart;