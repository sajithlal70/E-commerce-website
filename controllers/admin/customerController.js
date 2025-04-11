const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");

const customerInfo = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }
    let search = req.query.search || '';
    let page = parseInt(req.query.page) || 1;
    const limit = 3;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .sort({ createdOn: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    }).countDocuments();

    const totalPages = Math.ceil(count / limit);

    // Check if request is AJAX
    if (req.xhr || req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        data: userData,
        totalPages,
        currentPages: page,
        search,
        count,
      });
    }

    // Render full page for non-AJAX requests
    res.render("customers", {
      data: userData,
      totalPages,
      currentPages: page,
      search,
      adminName: req.session.admin.name,
      error: null,
    });
  } catch (error) {
    console.error("Error fetching customer info:", error);
    if (req.xhr || req.headers.accept.includes('application/json')) {
      return res.status(500).json({
        success: false,
        message: "An error occurred while fetching customer information.",
      });
    }
    return res.render("customers", {
      data: [],
      totalPages: 0,
      currentPages: 1,
      search: '',
      adminName: req.session.admin ? req.session.admin.name : '',
      error: "An error occurred while fetching customer information.",
    });
  }
};

const blockCustomer = async (req, res) => {
  try {
    console.log("Block customer request received:", req.body);
    const { id } = req.body;
    if (!id) {
      console.warn("Missing customer ID");
      return res.status(400).json({ success: false, message: 'Customer ID is required' });
    }

    const user = await User.findById(id);
    if (!user) {
      console.warn(`Customer not found: ${id}`);
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await User.updateOne({ _id: id }, { $set: { IsBlocked: true } });
    console.log(`Customer blocked successfully: ${id}`);
    return res.status(200).json({ success: true, message: 'Customer blocked successfully' });
  } catch (error) {
    console.error("Error blocking customer:", error);
    return res.status(500).json({ success: false, message: `Failed to block customer: ${error.message}` });
  }
};

const unblockCustomer = async (req, res) => {
  try {
    console.log("Unblock customer request received:", req.body);
    const { id } = req.body;
    if (!id) {
      console.warn("Missing customer ID");
      return res.status(400).json({ success: false, message: 'Customer ID is required' });
    }

    const user = await User.findById(id);
    if (!user) {
      console.warn(`Customer not found: ${id}`);
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await User.updateOne({ _id: id }, { $set: { IsBlocked: false } });
    console.log(`Customer unblocked successfully: ${id}`);
    return res.status(200).json({ success: true, message: 'Customer unblocked successfully' });
  } catch (error) {
    console.error("Error unblocking customer:", error);
    return res.status(500).json({ success: false, message: `Failed to unblock customer: ${error.message}` });
  }
};

const viewCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await User.findById(customerId);
    
    if (!customer) {
      return res.status(404).render('error', { 
        message: 'Customer not found',
        error: { status: 404 },
      });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 5; // Orders per page
    const skip = (page - 1) * limit;

    // Get customer's orders with pagination
    const orders = await Order.find({ user: customerId })
      .sort({ createdAt: -1 })
      .populate('items.product')
      .skip(skip)
      .limit(limit);

    // Get total orders count for pagination
    const totalOrders = await Order.countDocuments({ user: customerId });
    const totalPages = Math.ceil(totalOrders / limit);

    // Get all orders for statistics (without pagination)
    const allOrders = await Order.find({ user: customerId });

    // Calculate total spent
    const totalSpent = allOrders.reduce((sum, order) => {
      if (order.orderStatus !== 'Cancelled' && order.orderStatus !== 'Returned') {
        return sum + order.total;
      }
      return sum;
    }, 0);

    // Calculate order statistics
    const orderStats = {
      total: totalOrders,
      completed: allOrders.filter(order => order.orderStatus === 'Delivered').length,
      cancelled: allOrders.filter(order => order.orderStatus === 'Cancelled').length,
      returned: allOrders.filter(order => order.orderStatus === 'Returned').length,
      inProgress: allOrders.filter(order => 
        ['Pending', 'Processing', 'Shipped'].includes(order.orderStatus)
      ).length,
    };

    res.render('customer-view', {
      customer,
      orders,
      totalSpent,
      orderStats,
      pagination: {
        page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
        lastPage: totalPages,
      },
      adminName: req.session.admin.name,
    });
  } catch (error) {
    console.error("Error viewing customer:", error);
    res.status(500).render('error', {
      message: 'Error viewing customer details',
      error: { status: 500 },
    });
  }
};

module.exports = { 
  customerInfo,
  blockCustomer,
  unblockCustomer,
  viewCustomer,
};