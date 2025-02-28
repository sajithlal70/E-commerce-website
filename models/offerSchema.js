const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({

  type: {
    type: String,
    enum: ['product', 'category'],
    required: true
  },
  discount: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  validFrom: {
    type: Date,
    required: true
  },
  validUntil: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'expired'],
    default: 'pending'
  },
  reference: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'referenceModel'
  },
  referenceModel: {
    type: String,
    required: true,
    enum: ['Product', 'Category']
  },
  previousPrice: {
    type: Number,
    default: null
  },
  previousPrices: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    price: {
      type: Number
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving

offerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Offer = mongoose.model('Offer', offerSchema);
module.exports = Offer ;