const mongoose = require("mongoose");
const { Schema } = mongoose;

const addressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    address: [
      {
        name: {
          type: String,
          required: true
        },
        phone: {
          type: String,
          required: true
        },
        street: {
          type: String,
          required: true
        },
        city: {
          type: String,
          required: true
        },
        postalCode: {
          type: String,
          required: true
        },
        landMark: String,
        addressType: {
          type: String,
          required: true,
          enum: ["Home", "Office", "Other"]
        },
        isDefault: {
          type: Boolean,
          default: false
        }
      }
    ]
  },
  { timestamps: true }
);

// Basic index for userId
addressSchema.index({ userId: 1 });

const Address = mongoose.model("Address", addressSchema);
module.exports = Address;