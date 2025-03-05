const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Item Cancelled', 'Item Return Requested', 'Returned'],
            default: 'Pending'
        },
        cancellationDetails: {
            reason: {
                type: String,
                enum: ['Taking_too_long_to_ship', 'wrong_item', 'damaged', 'size_issue', 'changed_mind', 'better_price', 'other'],
            },
            comments: String,
            date: Date,
            refundStatus: { 
                type: String,
                enum: ['Pending', 'Refunded', 'No Refund Required'],
                default: 'Pending'
            },
            refundAmount: Number 
        },
        deliveredAt: { 
            type: Date,
            default: null
        },
        refundDetails: { 
            amount: Number,
            processedAt: Date,
            transactionId: String,
            refundMethod: {
                type: String,
                enum: ['wallet', 'razorpay', 'bank', 'cod'],
                default: 'wallet'
            }
        },
        returnRequest: { 
            status: {
                type: String,
                enum: ['Pending', 'Approved', 'Rejected'],
                default: 'Pending'
            },
            requestReason: String,
            comments: String,
            requestedAt: Date,
            processedAt: Date,
            refundAmount: Number
        }
    }],
    shippingAddress: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        street: { type: String, required: true },
        city: { type: String, required: true },
        postalCode: { type: String, required: true },
        landMark: String,
        addressType: {
            type: String,
            enum: ['Home', 'Office', 'Other'],
            required: true
        }
    },
    paymentMethod: {
        type: String,
        enum: ['razorpay', 'cod', 'bank', 'wallet'],
        required: true
    },
    razorpayOrderId: String,
    subtotal: { type: Number, required: true },
    shippingCost: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    coupon: {
        code: String,
        discountAmount: Number,
        discountType: { type: String, enum: ['fixed', 'percentage'] },
        appliedAt: Date,
    },
    orderStatus: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Payment Failed', 'Return Requested', 'Returned'],
        default: 'Pending'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Cancelled'],
        default: 'Pending'
    },
    paymentDetails: {
        razorpay_payment_id: String,
        razorpay_order_id: String,
        razorpay_signature: String,
        verifiedAt: Date,
        error: String,
        failedAt: Date
    },
    couponCode: String,
    cancellationDetails: {
        reason: String,
        comments: String,
        date: Date,
        refundAmount: Number
    },
    returnDetails: {
        reason: String,
        comments: String,
        requestedAt: Date,
        status: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected'],
            default: 'Pending'
        },
        potentialRefundAmount: Number,
        processedAt: Date
    },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    stockReserved: { type: Boolean, default: false },
    paymentAttempts: { type: Number, default: 0 },
    actionsAllowed: [{
        type: String,
        enum: ['retry', 'abort'],
        default: []
    }]
}, {
    timestamps: true,
    indexes: [
        { key: { createdAt: -1 } }, 
        { key: { orderStatus: 1 } }, 
        { key: { 'items.product': 1 } } 
    ]
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;