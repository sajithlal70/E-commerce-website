const mongoose = require("mongoose");
const {Schema} = mongoose ; 

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  offerPrice: {
    type: Number,
    default: 0
  },
  offer: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Listed', 'Unlisted'],
    default: 'Listed'
  }
}, { timestamps: true });


const Category = mongoose.model("Category",categorySchema);

module.exports = Category ;  