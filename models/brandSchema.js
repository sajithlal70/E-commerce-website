const mongoose = require("mongoose");
const {Schema} = mongoose ;


const brandSchema = new Schema({

  brandNmae: {
    type:String,
    required:true
  },
  brandImage :{
    type:[String],
    required:true
  },
  isBlocked : {
    type: Boolean,
    default :false
  },
  createdAt : {
    type : Date,
    default:Date.no
  }

})


const Brand = mongoose.model("Brand",brandSchema);

module.exports = Brand ; 