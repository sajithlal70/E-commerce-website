const Product = require('../models/productSchema');
const Order = require('../models/orderSchema');


const updateProductStock = async (items, increase = false) => {
  
  for (const item of items) {
    try {
      const product = await Product.findById(item.product);
      if (!product) {
        throw new Error(`Product not found: ${item.product}`);
      }

      if (!increase && product.quantity < item.quantity) {
        throw new Error(`Insufficient stock for product: ${product.productName}`);
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        item.product,
        { $inc: { quantity: increase ? item.quantity : -item.quantity } },
        { new: true } 
      );

 
      if (updatedProduct.quantity <= 0) {
        await Product.findByIdAndUpdate(
          item.product,
          { $set: { status: "out of stock" } } 
        );
      } else if (updatedProduct.quantity > 0 && updatedProduct.status === "out of stock") {
        await Product.findByIdAndUpdate(
          item.product,
          { $set: { status: "Available" } }
        );
      }

    } catch (error) {
      console.error('Error updating product stock:', error);
      throw error;
    }
  }
};



const handleReturnRequest = async (req, res) => {
  try {
      const { orderId } = req.params;
      const { status, adminComments } = req.body;

      const order = await Order.findById(orderId);
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
          order.orderStatus = 'Returned';
          
          await updateProductStock(order.items, true);
      } else if (status === 'Rejected') {
          order.orderStatus = 'Delivered';
      } else {
          return res.status(400).json({
              success: false,
              message: 'Invalid return status'
          });
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

module.exports = {
  updateProductStock,
  handleReturnRequest,
} 