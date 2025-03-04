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
        { 'shippingAddress.name': { $regex: search, $options: 'i' } },
        { '_id': { $regex: search, $options: 'i' } } // Add Order ID search
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
    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Define status mappings
    const statusConfig = {
      Delivered: { itemStatus: 'Delivered', setDeliveredAt: true },
      Shipped: { itemStatus: 'Shipped' },
      Processing: { itemStatus: 'Processing' },
      Pending: { itemStatus: 'Pending' },
      Cancelled: { itemStatus: 'Item Cancelled', refund: true },
    };

    if (!statusConfig[orderStatus]) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    const config = statusConfig[orderStatus];
    const previousStatus = order.orderStatus;
    order.orderStatus = orderStatus;

    // Update item statuses unless they're in a user-initiated terminal state
    order.items.forEach(item => {
      // Only update if not in a user-initiated terminal state
      if (!['Item Cancelled', 'Returned', 'Item Return Requested'].includes(item.status)) {
        item.status = config.itemStatus;
        if (config.setDeliveredAt) item.deliveredAt = new Date();
        if (config.refund) {
          item.cancellationDetails = {
            reason: 'Order cancelled by admin',
            date: new Date(),
            refundStatus: order.paymentStatus === 'Paid' ? 'Pending' : 'No Refund Required',
          };
        }
      }
    });

    // Order-level updates
    if (config.setDeliveredAt && previousStatus !== 'Delivered') {
      order.deliveredAt = new Date();
    }

    // Refund logic for Cancelled status
    if (config.refund && order.paymentStatus === 'Paid') {
      let totalRefundAmount = 0;
      const bulkOps = [];

      for (const item of order.items) {
        if (item.status === 'Item Cancelled' && !item.refundDetails) {
          const refundAmount = item.price * item.quantity;
          totalRefundAmount += refundAmount;

          item.refundDetails = {
            amount: refundAmount,
            processedAt: new Date(),
            refundMethod: 'wallet',
          };
          item.cancellationDetails.refundStatus = 'Refunded to wallet';
          item.cancellationDetails.refundAmount = refundAmount;

          bulkOps.push({
            updateOne: {
              filter: { _id: item.product._id },
              update: { $inc: { quantity: item.quantity } },
            },
          });
        }
      }

      if (totalRefundAmount > 0) {
        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
          let wallet = await Wallet.findOne({ userId: order.user }).session(session);
          if (!wallet) {
            wallet = await Wallet.create(
              { userId: order.user, balance: 0 },
              { session }
            );
          }

          const newBalance = wallet.balance + totalRefundAmount;
          const transaction = await Transaction.create(
            [{
              walletId: wallet._id,
              userId: order.user,
              type: 'credit',
              amount: totalRefundAmount,
              description: `Refund for cancelled order #${order._id}`,
              transactionType: 'refund',
              balance: newBalance,
              reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
              status: 'completed',
              orderId: order._id,
              paymentMethod: order.paymentMethod,
            }],
            { session }
          );

          wallet.balance = newBalance;
          await wallet.save({ session });
          if (bulkOps.length) await Product.bulkWrite(bulkOps, { session });

          order.paymentStatus = 'Refunded';
          order.refundDetails = {
            amount: totalRefundAmount,
            processedAt: new Date(),
            transactionId: transaction[0]._id,
            refundMethod: 'wallet',
          };
        });
        session.endSession();
      }
    }

    await order.save();
    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
};


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

const updateOrderItemStatus = async (req, res) => {
  try {
      const { orderId, itemId } = req.params;
      const { itemStatus } = req.body;

      const order = await Order.findById(orderId).populate('items.product');
      if (!order) {
          return res.status(404).json({
              success: false,
              message: 'Order not found'
          });
      }

      const orderItem = order.items.id(itemId);
      if (!orderItem) {
          return res.status(404).json({
              success: false,
              message: 'Order item not found'
          });
      }

      // Prevent changing status if already in a terminal state
      if (['Delivered', 'Cancelled', 'Item Cancelled','Item Return Requested'].includes(orderItem.status)) {
          return res.status(400).json({
              success: false,
              message: 'Cannot update status of an item that is already delivered or cancelled'
          });
      }

      // If changing to "Item Cancelled", handle refund and stock update
      if (itemStatus === 'Item Cancelled' && order.paymentStatus === 'Paid') {
          const refundAmount = orderItem.price * orderItem.quantity;

          let wallet = await Wallet.findOne({ userId: order.user });
          if (!wallet) {
              wallet = await Wallet.create({
                  userId: order.user,
                  balance: 0
              });
          }

          const newBalance = wallet.balance + refundAmount;

          const transaction = await Transaction.create({
              walletId: wallet._id,
              userId: order.user,
              type: 'credit',
              amount: refundAmount,
              description: `Refund for cancelled item in order #${order._id}`,
              transactionType: 'refund',
              balance: newBalance,
              reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
              status: 'completed',
              orderId: order._id,
              paymentMethod: order.paymentMethod || 'wallet'
          });

          wallet.balance = newBalance;
          await wallet.save();

          orderItem.refundDetails = {
              amount: refundAmount,
              processedAt: new Date(),
              transactionId: transaction._id,
              refundMethod: 'wallet'
          };

          orderItem.cancellationDetails = {
              reason: 'Cancelled by admin',
              date: new Date(), // Changed to match schema
              refundStatus: 'Refunded to wallet',
              refundAmount: refundAmount
          };

          // Update stock
          await Product.findByIdAndUpdate(
              orderItem.product._id,
              { $inc: { quantity: orderItem.quantity } }
          );

          // Adjust order totals
          order.subtotal -= refundAmount;
          order.total = order.subtotal + order.shippingCost - (order.discountAmount || 0);

          // Check if all items are cancelled
          const allItemsCancelled = order.items.every(item => 
              ['Cancelled', 'Item Cancelled'].includes(item.status)
          );
          if (allItemsCancelled) {
              order.orderStatus = 'Cancelled';
              order.paymentStatus = 'Refunded';
          }
      }

      // Update item status
      orderItem.status = itemStatus;

      // If item is marked as Delivered, update deliveredAt
      if (itemStatus === 'Delivered') {
          orderItem.deliveredAt = new Date();
      }

      await order.save();

      res.json({
          success: true,
          message: 'Item status updated successfully'
      });
  } catch (error) {
      console.error('Error updating item status:', error);
      res.status(500).json({
          success: false,
          message: 'Server error while updating item status',
          error: error.message 
      });
  }
};

const processReturnRequest = async (req, res) => {
  try {
      const { orderId, itemId } = req.params;
      const { status, adminComments } = req.body;
      const adminId = req.session.admin._id; 
      console.log('Adminid:',adminId);
      

      const order = await Order.findById(orderId).populate('items.product');
      if (!order) {
          return res.status(404).json({ 
              success: false, 
              message: 'Order not found' 
          });
      }

      const item = order.items.id(itemId);
      if (!item) {
          return res.status(404).json({ 
              success: false, 
              message: 'Item not found' 
          });
      }

      // Validate item status is 'Item Return Requested'
      if (item.status !== 'Item Return Requested') {
          return res.status(400).json({ 
              success: false, 
              message: 'Item is not in Item Return Requested status' 
          });
      }

      // Update return request (if it exists) or just proceed with status update
      if (item.returnRequest) {
          item.returnRequest.status = status;
          item.returnRequest.adminResponse = {
              by: adminId,
              comments: adminComments,
              respondedAt: new Date()
          };
      }

      // Note: Adjust this if 'returnRequests.pendingCount' exists in your schema
      // If not, remove this block or ensure it aligns with your schema
      if (status !== 'Pending' && order.returnRequests?.pendingCount) {
          order.returnRequests.pendingCount -= 1;
      }

      if (status === 'Approved') {
          item.status = 'Returned';
          const refundAmount = item.price * item.quantity;

          let wallet = await Wallet.findOne({ userId: order.user });
          if (!wallet) {
              wallet = await Wallet.create({
                  userId: order.user,
                  balance: 0
              });
          }

          const newBalance = wallet.balance + refundAmount;

          const transaction = await Transaction.create({
              walletId: wallet._id,
              userId: order.user,
              type: 'credit',
              amount: refundAmount,
              description: `Refund for returned item in order #${order._id}`,
              transactionType: 'refund',
              balance: newBalance,
              reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
              status: 'completed',
              orderId: order._id,
              paymentMethod: order.paymentMethod || 'wallet'
          });

          wallet.balance = newBalance;
          await wallet.save();

          await Product.findByIdAndUpdate(
              item.product._id,
              { $inc: { quantity: item.quantity } }
          );

          item.refundDetails = {
              amount: refundAmount,
              processedAt: new Date(),
              refundReason: 'Return Approved',
              transactionId: transaction._id
          };

          order.subtotal -= refundAmount;
          order.total = order.subtotal + order.shippingCost - (order.discountAmount || 0);
      } else if (status === 'Rejected') {
          item.status = 'Delivered'; 
      }

      await order.save();

      res.json({ 
          success: true, 
          message: `Return request ${status.toLowerCase()} successfully`,
          data: {
              itemStatus: item.status
          }
      });
  } catch (error) {
      console.error('Return request processing error:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Failed to process return request',
          error: error.message 
      });
  }
};

module.exports = {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  handleReturnRequest,
  updateOrderItemStatus,
  processReturnRequest
}