const mongoose = require('mongoose');
const env = require('dotenv').config();

const connectDB = async ()=>  {
  try{
    await mongoose.connect(process.env.MONGODB_URI);
  }
  catch(error) {
    console.log("DB CONNECTION ERROR!!!",error.message);
    process.exit(1);
  }
}


module.exports = connectDB; 