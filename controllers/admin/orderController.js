const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema');
const Coupon  = require('../../models/couponSchema');
const {processRefund} = require('../user/walletController');
const Transaction = require('../../models/transactionSchema');
const Wallet = require('../../models/walletSchema');

  const getAllOrders = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const search = req.query.search || '';
      const status = req.query.status || '';
       
      // Build filter query
      let query = {};
      if (status) {
        query.orderStatus = status;
      }
      if (search) {
        query.$or = [
          { 'shippingAddress.name': { $regex: search, $options: 'i' } }
        ];
      }

      // Get orders with pagination
      const orders = await Order.find(query)
        .populate('user')
        .populate('items.product')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      // Get total count for pagination
      const total = await Order.countDocuments(query);

      // Calculate stats
      const stats = await getOrderStats();

      const returnRequestsCount = await Order.countDocuments({ 
        orderStatus: 'Return Requested' 
    });

      res.render('order', {
        orders,
        stats,
        pagination: {
          page,
          limit,
          adminName: req.session.admin.name,
          total,
          pages: Math.ceil(total / limit)
        },
        currentFilter: { status, search },
        returnRequestsCount
      });
    } catch (error) {
      console.error('Error getting orders:', error);
      res.status(500).send('Error getting orders');
    }
  };

  const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user')
            .populate('items.product')
            .populate('coupon');  

        if (!order) {
            return res.status(404).send('Order not found');
        }
        
        res.render('orderDetails', { order });
    } catch (error) {
        console.error('Error getting order details:', error);
        res.status(500).send('Error getting order details');
    }
};

  const updateOrderStatus = async (req, res) => {
    try {
      const { orderStatus } = req.body;
      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).send('Order not found');
      }

      const previousStatus = order.orderStatus;
      order.orderStatus = orderStatus;

      if (orderStatus === 'Delivered' && previousStatus !== 'Delivered') {
        order.deliveredAt = new Date();
    }
   
      await order.save();

      res.json({
        success: true,
        message: 'Order status updated successfully'
    });
} catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
        success: false,
        message: 'Failed to update order status'
    });
}
  }


  const handleReturnRequest = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, adminComments } = req.body;

        const order = await Order.findById(orderId)
            .populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.orderStatus !== 'Return Requested') {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status for return handling'
            });
        }

        if (status === 'Approved') {
            try {
                // Get wallet
                let wallet = await Wallet.findOne({ userId: order.user });
                if (!wallet) {
                    wallet = await Wallet.create({
                        userId: order.user,
                        balance: 0
                    });
                }

                const refundAmount = order.total;
                const newBalance = wallet.balance + refundAmount;

                // Create transaction
                const transaction = await Transaction.create({
                    walletId: wallet._id,
                    userId: order.user,
                    type: 'credit',
                    amount: refundAmount,
                    description: `Refund for returned order #${order._id}`,
                    transactionType: 'refund',
                    balance: newBalance,
                    reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
                    status: 'completed',
                    orderId: order._id,
                    paymentMethod: order.paymentMethod || 'wallet'
                });

                // Update wallet balance
                wallet.balance = newBalance;
                await wallet.save();

                // Update stock for each returned item
                for (const item of order.items) {
                    await Product.findByIdAndUpdate(
                        item.product._id,
                        { $inc: { quantity: item.quantity } }
                    );
                }

                order.orderStatus = 'Returned';
                order.paymentStatus = 'Refunded';
                order.refundDetails = {
                    amount: refundAmount,
                    processedAt: new Date(),
                    transactionId: transaction._id,
                    refundMethod: 'wallet'
                };
            } catch (refundError) {
                console.error('Return refund failed:', refundError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process return refund'
                });
            }
        } else if (status === 'Rejected') {
            order.orderStatus = 'Delivered';
        }

        order.returnDetails.status = status;
        order.returnDetails.adminComments = adminComments;
        order.returnDetails.processedAt = new Date();

        await order.save();

        res.json({
            success: true,
            message: `Return request ${status.toLowerCase()} successfully`
        });
    } catch (error) {
        console.error('Handle return request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process return request'
        });
    }
};


async function getOrderStats() {
  try {
    const [totalStats] = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'Refunded'] },
                0,  // Don't count refunded orders in revenue
                {
                  $cond: [
                    { $in: ['$orderStatus', ['Cancelled', 'Returned']] },
                    0,  // Don't count cancelled or returned orders
                    '$total'  // Count all other orders
                  ]
                }
              ]
            }
          },
          totalOrders: { $sum: 1 },
          pendingOrders: {
            $sum: {
              $cond: [{ $eq: ['$orderStatus', 'Pending'] }, 1, 0]
            }
          },
          completedOrders: {
            $sum: {
              $cond: [{ $eq: ['$orderStatus', 'Delivered'] }, 1, 0]
            }
          },
          // Track refunded amount
          totalRefunds: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'Refunded'] },
                '$total',
                0
              ]
            }
          },
          // Track cancelled orders
          cancelledOrders: {
            $sum: {
              $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, 1, 0]
            }
          },
          // Track returned orders
          returnedOrders: {
            $sum: {
              $cond: [{ $eq: ['$orderStatus', 'Returned'] }, 1, 0]
            }
          },
          // Track return requests
          returnRequests: {
            $sum: {
              $cond: [{ $eq: ['$orderStatus', 'Return Requested'] }, 1, 0]
            }
          },
          // Track processing orders
          processingOrders: {
            $sum: {
              $cond: [{ $eq: ['$orderStatus', 'Processing'] }, 1, 0]
            }
          },
          // Track shipped orders
          shippedOrders: {
            $sum: {
              $cond: [{ $eq: ['$orderStatus', 'Shipped'] }, 1, 0]
            }
          }
        }
      }
    ]);

    return {
      totalRevenue: totalStats?.totalRevenue || 0,
      totalOrders: totalStats?.totalOrders || 0,
      pendingOrders: totalStats?.pendingOrders || 0,
      completedOrders: totalStats?.completedOrders || 0,
      returnRequests: totalStats?.returnRequests || 0
    };
  } catch (error) {
    console.error('Error calculating stats:', error);
    return {
      totalRevenue: 0,
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0
    };
  }
}

module.exports = {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  handleReturnRequest
}