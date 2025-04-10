require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Coupon = require ('../../models/couponSchema');
const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { updateProductStock } = require('../../helpers/productStockUpdate');


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID);
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET);

const SHIPPING_COST = 50;
const paymentController = {
 
    initiatePayment: async (req, res) => {
      let cart = null;
      let savedOrder = null;

      try {
        const { addressId, couponCode } = req.body;
        const userId = req.session.user._id;
        
        console.log('Payment Initiation - Request Data:', {
            addressId,
            couponCode,
            appliedCoupon: req.session.appliedCoupon,
            userId
        });

        // Get cart with populated products
        cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || !cart.items.length) {
            throw new Error('Cart is empty');
        }

        // Get shipping address
        const address = await Address.findOne({ userId });
        const selectedAddress = address.address.find(addr => addr._id.toString() === addressId);
        if (!selectedAddress) {
            throw new Error('Invalid shipping address');
        }

        // Calculate amounts
        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        const shippingCost = 50;
        const discountAmount = req.session.appliedCoupon ? req.session.appliedCoupon.actualDiscount : 0;
        const total = subtotal + shippingCost - discountAmount;
        const totalInPaise = Math.round(total * 100);

        console.log('Payment Initiation - Amount Details:', {
            subtotal,
            shippingCost,
            discountAmount,
            total,
            totalInPaise
        });

        // Create initial order
        const newOrder = new Order({
            user: userId,
            items: cart.items.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.product.salePrice,
                status: 'Pending'
            })),
            shippingAddress: selectedAddress,
            paymentMethod: 'razorpay',
            subtotal,
            shippingCost,
            discountAmount,
            total,
            orderStatus: 'Pending',
            paymentStatus: 'pending',
            couponCode: couponCode || null,
            stockReserved: true,
            paymentAttempts: 0,
            actionsAllowed: ['retry', 'abort']
        });

        // Save order to get MongoDB ID
        savedOrder = await newOrder.save();

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: totalInPaise,
            currency: 'INR',
            receipt: `rcpt_${Date.now()}_${savedOrder._id.toString().slice(-6)}`,
            notes: {
                userId: userId.toString(),
                orderId: savedOrder._id.toString(),
                addressId,
                couponCode: couponCode || '',
                total
            }
        });

        // Update order with Razorpay details
        savedOrder.razorpayOrderId = razorpayOrder.id;
        await savedOrder.save();

        // Store order ID in session for failure handling
        req.session.currentOrderId = savedOrder._id;

        res.json({
            success: true,
            order: razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID,
            mongoOrderId: savedOrder._id
        });

    } catch (error) {
        console.error('Payment initiation error:', error);
        
        if (savedOrder) {
            savedOrder.orderStatus = 'Payment Failed';
            savedOrder.paymentStatus = 'failed';
            savedOrder.paymentDetails = {
                error: error.message,
                failedAt: new Date()
            };
            await savedOrder.save();
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Payment initiation failed',
            orderId: savedOrder?._id
        });
    }
},

    verifyPayment: async (req, res) => {
        try {
            const {
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_signature,
                addressId,
                amount
            } = req.body;

            // Verify signature
            const sign = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSign = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(sign.toString())
                .digest("hex");

            if (razorpay_signature !== expectedSign) {
                throw new Error("Invalid payment signature");
            }

            const userId = req.session.user._id;
            
            // Get cart with populated products
            const cart = await Cart.findOne({ user: userId }).populate('items.product');
            if (!cart || !cart.items.length) {
                throw new Error('Cart is empty');
            }

            // Get shipping address
            const address = await Address.findOne({ userId });
            const selectedAddress = address.address.find(addr => addr._id.toString() === addressId);
            if (!selectedAddress) {
                throw new Error('Invalid shipping address');
            }

            // Calculate amounts
            const subtotal = cart.items.reduce((total, item) => {
                return total + (item.product.salePrice * item.quantity);
            }, 0);

            const shippingCost = 50;
            const discountAmount = req.session.appliedCoupon ? req.session.appliedCoupon.actualDiscount : 0;
            const total = subtotal + shippingCost - discountAmount;

            // Create order
            const order = await Order.create({
                user: userId,
                items: cart.items.map(item => ({
                    product: item.product._id,
                    quantity: item.quantity,
                    price: item.product.salePrice
                })),
                shippingAddress: selectedAddress,
                paymentMethod: 'razorpay',
                subtotal,
                shippingCost,
                total,
                discountAmount,
                orderStatus: 'Processing',
                paymentStatus: 'Paid',
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id
            });

            // Update product stock
            for (const item of cart.items) {
                const updatedProduct = await Product.findOneAndUpdate(
                    { 
                        _id: item.product._id,
                        quantity: { $gte: item.quantity }
                    },
                    { 
                        $inc: { quantity: -item.quantity }
                    },
                    { new: true }
                );

                if (!updatedProduct) {
                    throw new Error(`Failed to update stock for ${item.product.productName}`);
                }
            }

            // Clear cart
            await Cart.findOneAndUpdate(
                { user: userId },
                { $set: { items: [] } }
            );

            // Clear applied coupon
            if (req.session.appliedCoupon) {
                delete req.session.appliedCoupon;
            }

            res.json({
                success: true,
                orderId: order._id,
                message: 'Payment verified and order placed successfully'
            });

        } catch (error) {
            console.error('Payment verification error:', error);
            res.status(400).json({
                success: false,
                message: error.message || 'Payment verification failed'
            });
        }
    },

    getOrderFailurePage: async (req, res) => {
        try {
            const categories = await Category.find();
            const user = req.session.user;
            
            // Try to get orderId from session first, then from query params
            const orderId = req.session.currentOrderId || req.query.orderId;
            const mongoOrderId = req.query.mongoOrderId;
            const razorpayOrderId = req.query.razorpayOrderId;
            const failureReason = req.query.failureReason || 'Payment session expired';

            console.log('Order failure page params:', {
                sessionOrderId: req.session.currentOrderId,
                queryOrderId: orderId,
                mongoOrderId,
                razorpayOrderId,
                failureReason
            });

            let order = null;
            if (mongoOrderId) {
                order = await Order.findById(mongoOrderId);
            } else if (orderId) {
                order = await Order.findById(orderId);
            }
            console.log('Found order:', order ? 'yes' : 'no');

            res.render('user/order-failure', {
                categories,
                user,
                orderId: razorpayOrderId || 'Not Available',
                mongoOrderId: order?._id || mongoOrderId || null,
                failureReason,
                paymentMethod: 'razorpay',
                order,
                title: 'Payment Failed'
            });
        } catch (error) {
            console.error('Error rendering order failure page:', error);
            res.render('user/order-failure', {
                categories: [],
                user: req.session.user,
                orderId: 'Not Available',
                mongoOrderId: null,
                failureReason: 'An error occurred while loading the page',
                paymentMethod: 'razorpay',
                title: 'Payment Failed'
            });
        }
    },

    handlePaymentFailure: async (req, res) => {
        try {
            const orderId = req.session.currentOrderId || req.body.orderId || req.query.orderId;
            const razorpayOrderId = req.body.razorpayOrderId || req.query.razorpayOrderId;
            const failureReason = req.body.failureReason || req.query.failureReason || 'Payment session expired';

            if (!orderId) {
                console.error('No orderId available for payment failure handling');
                return res.render('user/order-failure', {
                    orderId: 'Not Available',
                    mongoOrderId: null,
                    failureReason: 'Order information not found',
                    paymentMethod: 'razorpay'
                });
            }

            // Find and update the order
            const order = await Order.findById(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            // Update order status to explicitly mark as failed
            order.orderStatus = 'Payment Failed'; // Changed from 'Pending'
            order.paymentStatus = 'failed';       // Changed from 'pending'
            order.paymentAttempts += 1;
            order.actionsAllowed = ['retry', 'abort']; // Explicitly allow retry and abort
            order.paymentDetails = {
                error: failureReason,
                razorpayOrderId,
                failedAt: new Date()
            };

            await order.save();
            console.log('Updated failed order:', {
                orderId: order._id,
                orderStatus: order.orderStatus,
                paymentStatus: order.paymentStatus,
                actionsAllowed: order.actionsAllowed
            });

            // Clear the session order ID
            delete req.session.currentOrderId;

            res.render('user/order-failure', {
                orderId: razorpayOrderId || 'Not Available',
                mongoOrderId: order._id,
                failureReason: failureReason,
                paymentMethod: 'razorpay',
                order,
                categories: await Category.find(),
                user: req.session.user
            });

        } catch (error) {
            console.error('Payment failure handler error:', error);
            res.render('user/order-failure', {
                categories: await Category.find(),
                user: req.session.user,
                orderId: 'Not Available',
                mongoOrderId: null,
                failureReason: error.message || 'An unexpected error occurred',
                paymentMethod: 'razorpay'
            });
        }
    },

    abortOrder: async (req, res) => {
        try {
            const { orderId } = req.params;
            const userId = req.session.user._id;
            
            console.log('Abort Order Request:', {
                orderId,
                userId,
                sessionUser: req.session.user
            });

            // Find the order and verify it belongs to the current user
            const order = await Order.findOne({
                _id: orderId,
                user: userId
            });

            console.log('Found Order:', {
                orderExists: !!order,
                orderStatus: order?.orderStatus,
                actionsAllowed: order?.actionsAllowed
            });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found or unauthorized'
                });
            }

            // Update order status
            order.orderStatus = 'Cancelled';
            order.paymentStatus = 'cancelled';
            order.cancelledAt = new Date();
            
            // Save the updated order
            const savedOrder = await order.save();
            console.log('Order cancelled successfully:', savedOrder);

            // Restore inventory if needed
            for (const item of order.items) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { 
                        $inc: { quantity: item.quantity },
                        $set: { 
                            status: 'Available'
                        }
                    }
                );
            }
            
            res.json({
                success: true,
                message: 'Order cancelled successfully'
            });

        } catch (error) {
            console.error('Error in abortOrder:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to cancel order. Please try again.'
            });
        }
    }
};

module.exports = paymentController;
