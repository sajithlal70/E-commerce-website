const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Order = require('../../models/orderSchema');

const getDashboard = async (req,res) => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const yesterdayStart = new Date(today);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Get orders statistics
    const orderStats = await Order.aggregate([
        {
            $facet: {
                'today': [
                    { $match: { createdAt: { $gte: startOfToday } } },
                    {
                        $group: {
                            _id: null,
                            revenue: { $sum: '$total' },
                            count: { $sum: 1 }
                        }
                    }
                ],
                'yesterday': [
                    { 
                        $match: { 
                            createdAt: { 
                                $gte: yesterdayStart,
                                $lt: startOfToday 
                            } 
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            revenue: { $sum: '$total' },
                            count: { $sum: 1 }
                        }
                    }
                ],
                'orderStatus': [
                    {
                        $group: {
                            _id: '$orderStatus',
                            count: { $sum: 1 }
                        }
                    }
                ]
            }
        }
    ]);

    // Get top products
    const topProducts = await Order.aggregate([
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.product',
                totalSales: { $sum: '$items.quantity' },
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
            }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 }, // Increased from 3 to 5 for better chart display
        {
            $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: '$productInfo' }
    ]);

    // Get top categories
    const topCategories = await Order.aggregate([
        { $unwind: '$items' },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'product'
            }
        },
        { $unwind: '$product' },
        {
            $lookup: {
                from: 'categories',
                localField: 'product.category',
                foreignField: '_id',
                as: 'category'
            }
        },
        { $unwind: '$category' },
        {
            $group: {
                _id: '$category._id',
                categoryName: { $first: '$category.name' },
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
            }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 } // Increased from 3 to 5 for better chart display
    ]);

    // Get recent orders
    const recentOrders = await Order.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .populate('user', 'name')
        .populate('items.product', 'productName');

    // Get low stock products
    const lowStockProducts = await Product.find({
        quantity: { $lt: 3 },
        isBlocked: false
    })
    .sort({quantity:1})
    .select('productName quantity')
    .limit(3);

    // Get sales data for chart (last 7 days)
    const salesChart = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: lastWeekStart },
                orderStatus: { $nin: ['Cancelled', 'Returned'] }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: "$total" },
                orders: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Calculate percentage changes
    const todayRevenue = orderStats[0].today[0]?.revenue || 0;
    const yesterdayRevenue = orderStats[0].yesterday[0]?.revenue || 1; // Prevent division by zero
    const revenueChange = ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100).toFixed(1);

    // Get order status counts
    const statusCounts = orderStats[0].orderStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
    }, {});

    return res.render('dashboard', {
        stats: {
            todayRevenue,
            revenueChange,
            pendingOrders: statusCounts['Pending'] || 0,
            processingOrders: statusCounts['Processing'] || 0,
            cancelledOrders: statusCounts['Cancelled'] || 0,
            shippedOrders: statusCounts['Shipped'] || 0,
            deliveredOrders: statusCounts['Delivered'] || 0
        },
        topProducts,
        topCategories,
        recentOrders,
        lowStockProducts,
        salesChart
    });

} catch (error) {
    console.error('Dashboard Error:', error);
    return res.status(500).render('error', { 
        message: 'Error loading dashboard' 
    });
}
};

module.exports = {
  getDashboard
}