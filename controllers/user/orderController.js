const Category = require("../../models/categorySchema");
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema')
const User = require('../../models/userSchema');
const Coupon  = require ( '../../models/couponSchema');
const {updateProductStock} = require('../../helpers/productStockUpdate');
const {processRefund,generateTransactionReference} = require('../../helpers/refundProcess')
const Product = require('../../models/productSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Wallet = require('../../models/walletSchema');
const Transaction = require('../../models/transactionSchema');
const razorpayHelper = require('../../helpers/razorpay');
const mongoose = require('mongoose');

// Initialize Razorpay with your credentials
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const confirmOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }


        for (const item of cart.items) {
            if (item.product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${item.product.name}. Available: ${item.product.quantity}`
                });
            }
        }

        
        const { addressId, paymentMethod, couponCode, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        
        if (!addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Address and payment method are required'
            });
        }
        
        if (paymentMethod === 'Razorpay') {
            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment details'
                });
            }

            // Verify signature
            const sign = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSign = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(sign.toString())
                .digest("hex");

            if (razorpay_signature !== expectedSign) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment signature'
                });
            }
        }
        
        const addressDoc = await Address.findOne({ userId: userId });
        if (!addressDoc) {
            return res.status(400).json({
                success: false,
                message: 'No addresses found for this user'
            });
        }

        const selectedAddress = addressDoc.address.find(addr => 
            addr._id.toString() === addressId
        );
        
        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Invalid delivery address'
            });
        }

        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        let discountAmount = 0;
        let couponDetails = null;

        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode, status: 'active' });

            if (!coupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired coupon'
                });
            }

            // Validate coupon for order
            const validationResult = await coupon.validateForOrder(userId, subtotal);
            if (!validationResult.isValid) {
                return res.status(400).json({
                    success: false,
                    message: validationResult.message
                });
            }

            // Calculate discount
            const discountResult = coupon.calculateDiscount(subtotal);
            discountAmount = discountResult.discountAmount;

            // Update coupon usage
            const updateResult = await coupon.updateUsage(userId);
            if (!updateResult.success) {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to apply coupon. Please try again.'
                });
            }

            couponDetails = {
                code: coupon.code,
                discountType: coupon.discountType,
                discountAmount: discountAmount
            };
        }
        console.log(couponDetails);
        

        const shippingCost = 50;
        const total = subtotal - discountAmount + shippingCost;

        const orderItems = cart.items.map(item => ({
            product: item.product._id,
            quantity: item.quantity,
            price: item.product.salePrice 
        }));

        // Create new order with payment details
        const newOrder = await Order.create({
            user: userId,
            items: orderItems,
            shippingAddress: selectedAddress,
            paymentMethod: paymentMethod,
            discountAmount: discountAmount,
            subtotal: subtotal,
            shippingCost: shippingCost,
            total: total,
            coupon: couponDetails ? {
                ...couponDetails,
                appliedAt: new Date()  
            } : null,
            orderStatus: paymentMethod === 'cod' ? 'Pending' : 'Processing',
            paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
            paymentDetails: paymentMethod === 'razorpay' ? {
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_signature
            } : null
        });

        await updateProductStock(cart.items);

        // Clear cart
        await Cart.findByIdAndUpdate(cart._id, {
            $set: { items: [] }
        });


        res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: newOrder._id,
            appliedCoupon: couponDetails
        });
    } catch (error) {
        console.error('Order confirmation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to place order',
            error: error.message
        });
    }
};



const  getOrderMangement = async (req, res) => {
  try {

      const userId = req.session.user._id; 
      const user = req.session.user;
      
      const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate({
          path: 'items.product',
          select: 'productName productImage salePrice',
          model: 'Product'
      });

      const category = await Category.find();

      const processedOrders = orders.map(order => {
          const items = order.items.map(item => ({
              ...item.toObject(),
              product: item.product || {
                  productName: 'Product Unavailable',
                  productImage: ['default.jpg'],
                  salePrice: 0
              }
          }));
          return { ...order.toObject(), items };
      });

      res.render('ordermanagement', {
         orders: processedOrders,
         user: user,
         categories: category
        }); 

  } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).send("Internal Server Error");
  }
};

const getOrderConfirmation = async (req, res) => {
    try {
        const category = await Category.find();
        const user = req.session.user;
        

        const order = await Order.findOne({ user: user._id })
            .sort({ createdAt: -1 })
            .populate('items.product');
        
        if (!order) {
            return res.redirect('/shop');
        }
        
        const couponInfo = order.couponApplied ? {
            code: order.couponApplied.code,
            discountType: order.couponApplied.discountType,
            discountAmount: order.couponApplied.discountAmount
        } : null;

        res.render('orderconfirmation', {
            categories: category,
            user: user,
            order: order,
            couponInfo: couponInfo
        });

    } catch (error) {
        console.error("Error fetching orderconfirmation:", error);
        res.status(500).send("Internal Server Error");
    }
};



const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user._id;

        // Find and validate order
        const order = await Order.findOne({ _id: id, user: userId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be cancelled
        if (!['Processing', 'Pending', 'Payment Failed'].includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: 'This order cannot be cancelled'
            });
        }

        // Handle refund for paid orders
        if (order.paymentStatus === 'Paid') {
            try {
                // Find or create user wallet
                let wallet = await Wallet.findOne({ userId });
                if (!wallet) {
                    wallet = await Wallet.create({
                        userId,
                        walletId: `WAL${Date.now().toString(36).toUpperCase()}`,
                        balance: 0
                    });
                }

                const refundAmount = order.total;
                const newBalance = wallet.balance + refundAmount;

                // Create refund transaction with payment method
                const transaction = await Transaction.create({
                    walletId: wallet._id,
                    userId,
                    type: 'credit',
                    amount: refundAmount,
                    description: `Refund for cancelled order #${order._id}`,
                    transactionType: 'refund',
                    balance: newBalance,
                    reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
                    status: 'completed',
                    orderId: order._id,
                    paymentMethod: order.paymentMethod
                });

                // Update wallet balance
                wallet.balance = newBalance;
                await wallet.save();

                // Update order refund details
                order.refundDetails = {
                    amount: refundAmount,
                    processedAt: new Date(),
                    transactionId: transaction._id,
                    refundMethod: 'wallet'
                };
            } catch (refundError) {
                console.error('Refund processing error:', refundError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process refund'
                });
            }
        }

        // Update order status
        order.orderStatus = 'Cancelled';
        order.paymentStatus = order.paymentStatus === 'Paid' ? 'Refunded' : 'Cancelled';
        order.cancellationDetails = {
            reason: req.body.reason || 'Cancelled by user',
            cancelledAt: new Date(),
            refundStatus: order.paymentStatus === 'Paid' ? 'Refunded to wallet' : 'No refund required'
        };

        // Release product stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { quantity: item.quantity } }
            );
        }

        await order.save();

        res.json({
            success: true,
            message: order.paymentStatus === 'Refunded' ? 
                'Order cancelled and refunded to wallet' : 
                'Order cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order'
        });
    }
};


const returnOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, comments } = req.body;
        const userId = req.session.user._id;

        const order = await Order.findOne({ _id: id, user: userId })
            .populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be returned at this stage'
            });
        }

        // Calculate potential refund amount
        const potentialRefundAmount = parseFloat(order.total);

        try {
            // Update order status and return details
            order.orderStatus = 'Return Requested';
            order.returnDetails = {
                reason,
                comments,
                date: new Date(),
                status: 'Pending',
                potentialRefundAmount: potentialRefundAmount
            };

            await order.save();

            res.json({
                success: true,
                message: 'Return request submitted successfully',
                potentialRefundAmount: potentialRefundAmount
            });
        } catch (validationError) {
            console.error('Validation error:', validationError);
            return res.status(400).json({
                success: false,
                message: 'Invalid order status or validation error',
                error: validationError.message
            });
        }
    } catch (error) {
        console.error('Return order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit return request'
        });
    }
};



const getOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id;

        const order = await Order.findOne({ _id: orderId, user: userId });
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        // Get timestamps for different statuses
        const orderTimeline = {
            ordered: {
                status: true,
                date: order.createdAt
            },
            processing: {
                status: ['Processing', 'Shipped', 'Delivered'].includes(order.orderStatus),
                date: order.createdAt
            },
            shipped: {
                status: ['Shipped', 'Delivered'].includes(order.orderStatus),
                date: order.shippedAt || null
            },
            delivered: {
                status: ['Delivered'].includes(order.orderStatus),
                date: order.deliveredAt || null
            }
        };

        res.json({
            success: true,
            orderStatus: order.orderStatus,
            timeline: orderTimeline
        });

    } catch (error) {
        console.error('Error fetching order status:', error);
        res.status(500).json({

            success: false,
            message: 'Failed to fetch order status'
        });
    }
};

const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.session.user._id;

        const order = await Order.findOne({ _id: orderId, user: userId })
            .populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Find the specific item
        const orderItem = order.items.id(itemId);
        if (!orderItem) {
            return res.status(404).json({
                success: false,
                message: 'Order item not found'
            });
        }

        // Check if item can be cancelled
        if (orderItem.status === 'Cancelled' || orderItem.status === 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Item cannot be cancelled'
            });
        }

        // Calculate refund amount
        const refundAmount = orderItem.price * orderItem.quantity;

        // Check if this is the last active item in the order
        const activeItems = order.items.filter(item => item.status !== 'Cancelled');
        const isLastItem = activeItems.length === 1 && activeItems[0]._id.toString() === itemId;

        // If this is the last item, use the full order cancellation process instead
        if (isLastItem) {
            order.orderStatus = 'Cancelled';
            order.paymentStatus = order.paymentStatus === 'Paid' ? 'Refunded' : 'Cancelled';
            order.cancellationDetails = {
                reason: req.body.reason || 'Last item cancelled by user',
                cancelledAt: new Date(),
                refundStatus: order.paymentStatus === 'Paid' ? 'Refunded to wallet' : 'No refund required'
            };

            // Process refund if order was paid
            if (order.paymentStatus === 'Paid') {
                try {
                    let wallet = await Wallet.findOne({ userId });
                    if (!wallet) {
                        wallet = await Wallet.create({
                            userId,
                            walletId: `WAL${Date.now().toString(36).toUpperCase()}`,
                            balance: 0
                        });
                    }

                    // Calculate the refund amount for the last item only
                    const refundAmount = orderItem.price * orderItem.quantity;
                    const newBalance = wallet.balance + refundAmount;

                    // Create refund transaction for the last item
                    const transaction = await Transaction.create({
                        walletId: wallet._id,
                        userId,
                        type: 'credit',
                        amount: refundAmount,
                        description: `Refund for final item in order #${order._id}`,
                        transactionType: 'refund',
                        balance: newBalance,
                        reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
                        status: 'completed',
                        orderId: order._id,
                        paymentMethod: order.paymentMethod
                    });

                    // Update wallet balance
                    wallet.balance = newBalance;
                    await wallet.save();

                    // Update order refund details
                    order.refundDetails = {
                        amount: refundAmount,
                        processedAt: new Date(),
                        transactionId: transaction._id,
                        refundMethod: 'wallet'
                    };

                    // Update item status
                    orderItem.status = 'Cancelled';
                    orderItem.cancellationDetails = {
                        reason: req.body.reason || 'Order cancelled - last item',
                        cancelledAt: new Date(),
                        refundStatus: 'Refunded to wallet'
                    };

                    // Update order totals
                    order.subtotal = 0;
                    order.total = order.shippingCost; // Only shipping cost remains
                } catch (refundError) {
                    console.error('Refund processing error:', refundError);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to process refund'
                    });
                }
            } else {
                // If not paid, just update the item status
                orderItem.status = 'Cancelled';
                orderItem.cancellationDetails = {
                    reason: req.body.reason || 'Order cancelled - last item',
                    cancelledAt: new Date(),
                    refundStatus: 'No refund required'
                };
                
                // Update order totals
                order.subtotal = 0;
                order.total = order.shippingCost;
            }
        } else {
            // Process refund for single item if order was paid
            if (order.paymentStatus === 'Paid') {
                try {
                    let wallet = await Wallet.findOne({ userId });
                    if (!wallet) {
                        wallet = await Wallet.create({
                            userId,
                            walletId: `WAL${Date.now().toString(36).toUpperCase()}`,
                            balance: 0
                        });
                    }

                    const newBalance = wallet.balance + refundAmount;

                    // Create refund transaction for single item
                    const transaction = await Transaction.create({
                        walletId: wallet._id,
                        userId,
                        type: 'credit',
                        amount: refundAmount,
                        description: `Refund for cancelled item in order #${order._id}`,
                        transactionType: 'refund',
                        balance: newBalance,
                        reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
                        status: 'completed',
                        orderId: order._id,
                        paymentMethod: order.paymentMethod
                    });

                    // Update wallet balance
                    wallet.balance = newBalance;
                    await wallet.save();

                    // Update item refund details
                    orderItem.refundDetails = {
                        amount: refundAmount,
                        processedAt: new Date(),
                        transactionId: transaction._id,
                        refundMethod: 'wallet'
                    };
                } catch (refundError) {
                    console.error('Item refund error:', refundError);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to process refund'
                    });
                }
            }

            // Update single item status
            orderItem.status = 'Cancelled';
            orderItem.cancellationDetails = {
                reason: req.body.reason || 'Cancelled by user',
                cancelledAt: new Date(),
                refundStatus: order.paymentStatus === 'Paid' ? 'Refunded to wallet' : 'No refund required'
            };

            // Update order totals
            order.subtotal -= refundAmount;
            order.total = order.subtotal + order.shippingCost - (order.discountAmount || 0);
        }

        // Release product stock
        await Product.findByIdAndUpdate(
            orderItem.product._id,
            { $inc: { quantity: orderItem.quantity } }
        );

        await order.save();

        res.json({
            success: true,
            message: order.paymentStatus === 'Paid' ? 
                'Item cancelled and refunded to wallet' : 
                'Item cancelled successfully',
            orderStatus: order.orderStatus
        });

    } catch (error) {
        console.error('Cancel order item error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order item'
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const userId = req.session.user._id;

        const order = await Order.findOne({ 
            razorpayOrderId: razorpay_order_id,
            user: userId 
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature !== expectedSign) {
            // Mark payment as failed
            order.orderStatus = 'Payment Failed';
            order.paymentStatus = 'Failed';
            order.paymentDetails = {
                error: 'Payment signature verification failed',
                failedAt: new Date(),
                razorpay_payment_id,
                razorpay_order_id
            };
            order.actionsAllowed = ['retry', 'abort'];
            await order.save();

            return res.status(400).json({
                success: false,
                message: 'Payment verification failed',
                orderId: order._id
            });
        }

        // Payment successful
        order.paymentStatus = 'Paid';
        order.orderStatus = 'Processing';
        order.paymentDetails = {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            verifiedAt: new Date()
        };
        order.actionsAllowed = [];

        await updateProductStock(order.items);
        await order.save();

        // Clear cart
        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [] } }
        );

        res.json({
            success: true,
            message: 'Payment successful',
            orderId: order._id
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        
        // Handle error and set failed status
        if (order) {
            order.orderStatus = 'Payment Failed';
            order.paymentStatus = 'Failed';
            order.paymentDetails = {
                error: error.message || 'Payment verification failed',
                failedAt: new Date()
            };
            order.actionsAllowed = ['retry', 'abort'];
            await order.save();
        }

        res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            orderId: order?._id
        });
    }
};

const handlePaymentFailure = async (req, res) => {
    try {
        const { orderId, error } = req.body;
        const userId = req.session.user._id;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Update order status
        order.orderStatus = 'Payment Failed';
        order.paymentStatus = 'Failed';
        order.paymentDetails = {
            error: error || 'Payment failed',
            failedAt: new Date()
        };
        order.actionsAllowed = ['retry', 'abort'];
        order.paymentAttempts = (order.paymentAttempts || 0) + 1;

        await order.save();

        // Log payment failure
        console.log('Payment failure recorded:', {
            orderId: order._id,
            error: error,
            attempts: order.paymentAttempts
        });

        res.json({
            success: true,
            message: 'Payment failure recorded',
            orderId: order._id,
            redirectUrl: `/order-failure?orderId=${order._id}&reason=${encodeURIComponent(error || 'Payment failed')}`
        });

    } catch (error) {
        console.error('Payment failure handling error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to handle payment failure'
        });
    }
};

const retryPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);

        if (!order || order.user.toString() !== req.session.user._id.toString()) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be retried
        if (!['Failed', 'Pending'].includes(order.paymentStatus)) {
            return res.status(400).json({
                success: false,
                message: 'This order cannot be retried'
            });
        }

        // Create new Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(order.total * 100),
            currency: 'INR',
            receipt: `retry_${orderId}`,
            notes: {
                orderId: orderId
            }
        });

        // Update order
        order.razorpayOrderId = razorpayOrder.id;
        order.paymentAttempts += 1;
        await order.save();

        res.json({
            success: true,
            key_id: process.env.RAZORPAY_KEY_ID,
            order: razorpayOrder
        });

    } catch (error) {
        console.error('Retry payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retry payment'
        });
    }
};

const verifyRetryPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // Update order status
        order.paymentStatus = 'Paid';
        order.orderStatus = 'Processing';
        order.paymentDetails = {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            verifiedAt: new Date()
        };

        await order.save();

        res.json({
            success: true,
            message: 'Payment successful'
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
};

const abortOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Find order and populate necessary fields
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be aborted
        if (!['Failed', 'Pending'].includes(order.paymentStatus) && 
            !['Payment Failed', 'Pending'].includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Only failed or pending payment orders can be aborted'
            });
        }

        // Update order status - Use correct enum values
        order.orderStatus = 'Cancelled';
        order.paymentStatus = 'Cancelled'; // Fixed: Use 'Cancelled' instead of 'cancelled'
        order.cancellationDetails = {
            reason: 'Aborted by user after payment failure',
            date: new Date(),
            cancelledAt: {
                status: 'Cancelled',
                timestamp: new Date()
            }
        };
        order.actionsAllowed = []; // Remove all allowed actions

        // Release any reserved stock if it was reserved
        if (order.stockReserved) {
            try {
                for (const item of order.items) {
                    if (!item.product) continue;
                    
                    const product = await Product.findById(item.product);
                    if (product) {
                        product.quantity += item.quantity;
                        await product.save();
                    }
                }
                order.stockReserved = false;
            } catch (stockError) {
                console.error('Error releasing stock:', stockError);
                // Continue with order cancellation even if stock update fails
            }
        }

        // Save the updated order
        await order.save();

        // Send success response
        res.json({
            success: true,
            message: 'Order cancelled successfully',
            order: {
                id: order._id,
                status: order.orderStatus,
                paymentStatus: order.paymentStatus
            }
        });

    } catch (error) {
        console.error('Error in abortOrder:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to cancel order'
        });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user._id;

        // Validate if orderId is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            req.flash('error', 'Invalid order ID');
            return res.redirect('/orders');
        }
        
        const categories = await Category.find();
        
        // Only populate product details, not address
        const order = await Order.findOne({
            _id: orderId,
            user: userId
        }).populate({
            path: 'items.product',
            select: 'productName productImage price salePrice color'
        });

        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        // Get order timeline data
        const timeline = {
            ordered: {
                status: true,
                date: order.createdAt
            },
            processing: {
                status: ['Processing', 'Shipped', 'Delivered'].includes(order.orderStatus),
                date: order.orderStatus === 'Processing' ? order.updatedAt : null
            },
            shipped: {
                status: ['Shipped', 'Delivered'].includes(order.orderStatus),
                date: order.shippedAt
            },
            delivered: {
                status: order.orderStatus === 'Delivered',
                date: order.deliveredAt
            }
        };

        res.render('user/order-details', {
            order,
            timeline,
            categories,
            user: req.session.user,
            title: 'Order Details'
        });

    } catch (error) {
        console.error('Error fetching order details:', error);
        req.flash('error', 'Error fetching order details');
        res.redirect('/orders');
    }
};

const initiatePayment = async (req, res) => {
    try {
        const { addressId, couponCode, amounts } = req.body;
        const userId = req.session.user._id;

        // Get cart items
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Get address details
        const addressDoc = await Address.findOne({ userId });
        const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === addressId);
        
        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Selected address not found'
            });
        }

        // Check stock availability
        for (const item of cart.items) {
            const product = await Product.findById(item.product._id);
            if (!product || product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product ? product.productName : 'product'}`
                });
            }
        }

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(amounts.total * 100),
            currency: 'INR',
            receipt: `order_${Date.now()}`,
            notes: {
                addressId,
                userId,
                couponCode
            }
        });

        // Create initial order with full address details
        const order = await Order.create({
            user: userId,
            items: cart.items.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.product.salePrice
            })),
            shippingAddress: {
                name: selectedAddress.name,
                phone: selectedAddress.phone,
                street: selectedAddress.street,
                city: selectedAddress.city,
                postalCode: selectedAddress.postalCode,
                landMark: selectedAddress.landMark,
                addressType: selectedAddress.addressType
            },
            paymentMethod: 'razorpay',
            subtotal: amounts.subtotal,
            shippingCost: amounts.shipping,
            discountAmount: amounts.discount || 0,
            total: amounts.total,
            orderStatus: 'Pending',
            paymentStatus: 'Pending',
            razorpayOrderId: razorpayOrder.id,
            couponCode
        });

        res.json({
            success: true,
            key_id: process.env.RAZORPAY_KEY_ID,
            order: razorpayOrder,
            orderId: order._id
        });

    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate payment'
        });
    }
};

const getCheckoutSummary = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        
        if (!cart) {
            return res.status(400).json({ success: false, message: 'Cart not found' });
        }

        // Calculate subtotal
        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        const shipping = 50; // Fixed shipping cost
        let discount = 0;
        let finalTotal = subtotal + shipping;

        // Calculate discount if coupon is applied
        const appliedCoupon = req.session.appliedCoupon;
        if (appliedCoupon) {
            if (appliedCoupon.discountType === 'percentage') {
                discount = (subtotal * appliedCoupon.discountAmount) / 100;
            } else {
                discount = Math.min(appliedCoupon.discountAmount, subtotal);
            }
            finalTotal = subtotal - discount + shipping;
        }

        res.json({
            success: true,
            subtotal: parseFloat(subtotal.toFixed(2)),
            shipping: parseFloat(shipping.toFixed(2)),
            discount: parseFloat(discount.toFixed(2)),
            total: parseFloat(finalTotal.toFixed(2)),
            appliedCoupon: appliedCoupon ? {
                code: appliedCoupon.code,
                discountType: appliedCoupon.discountType,
                discountAmount: appliedCoupon.discountAmount
            } : null
        });

    } catch (error) {
        console.error('Error getting checkout summary:', error);
        res.status(500).json({ success: false, message: 'Failed to get checkout summary' });
    }
};

const getOrderFailurePage = async (req, res) => {
    try {
        const { orderId, reason } = req.query;
        const order = await Order.findById(orderId);
        const categories = await Category.find();

        res.render('user/order-failure', {
            order,
            categories,
            user: req.session.user,
            failureReason: reason || 'Payment failed',
            orderId: order?.razorpayOrderId || 'Not Available'
        });
    } catch (error) {
        console.error('Error loading failure page:', error);
        res.redirect('/orders');
    }
};

module.exports = {  
  getOrderConfirmation,
  getOrderStatus,
  getOrderMangement,
  confirmOrder,
  cancelOrder,
  returnOrder,
  cancelOrderItem,
  verifyPayment,
  retryPayment,
  verifyRetryPayment,
  abortOrder,
  getOrderDetails,
  initiatePayment,
  getCheckoutSummary,
  getOrderFailurePage,
  handlePaymentFailure
}