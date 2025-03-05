const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

const getDashboard = async (req, res) => {
    try {
       
        let startDate, endDate;
        
       
        if (req.method === 'POST' && req.body.startDate && req.body.endDate) {
            startDate = new Date(req.body.startDate);
            endDate = new Date(req.body.endDate);
            endDate.setHours(23, 59, 59, 999);
            // Store in session
            req.session.dashboardFilter = { startDate, endDate };
        } 
        // Check session for previous filter
        else if (req.session.dashboardFilter) {
            startDate = new Date(req.session.dashboardFilter.startDate);
            endDate = new Date(req.session.dashboardFilter.endDate);
        } 
        // Default to today
        else {
            const today = new Date();
            startDate = new Date(today.setHours(0, 0, 0, 0));
            endDate = new Date(today.setHours(23, 59, 59, 999));
        }

        const previousStart = new Date(startDate);
        previousStart.setDate(previousStart.getDate() - (endDate.getDate() - startDate.getDate() + 1));
        const previousEnd = new Date(startDate);
        previousEnd.setHours(23, 59, 59, 999);

        // Order statistics with item-level consideration
        const orderStats = await Order.aggregate([
            {
                $facet: {
                    'currentPeriod': [
                        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                        { $unwind: '$items' },
                        {
                            $match: {
                                'items.status': { $nin: ['Cancelled', 'Returned', 'Item Cancelled'] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    'previousPeriod': [
                        { $match: { createdAt: { $gte: previousStart, $lte: previousEnd } } },
                        { $unwind: '$items' },
                        {
                            $match: {
                                'items.status': { $nin: ['Cancelled', 'Returned', 'Item Cancelled'] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    'statusCounts': [
                        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                        { $unwind: '$items' },
                        {
                            $group: {
                                _id: '$items.status',
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            }
        ]);

        // Rest of the aggregations remain the same
        const topProducts = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $unwind: '$items' },
            { $match: { 'items.status': { $nin: ['Cancelled', 'Returned', 'Item Cancelled'] } } },
            {
                $group: {
                    _id: '$items.product',
                    totalSales: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            { $sort: { revenue: -1 } },
            { $limit: 5 },
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

        const topCategories = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $unwind: '$items' },
            { $match: { 'items.status': { $nin: ['Cancelled', 'Returned', 'Item Cancelled'] } } },
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
            { $limit: 5 }
        ]);

        const recentOrders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $nin: ['Cancelled', 'Returned', 'Payment Failed'] }
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name')
            .populate('items.product', 'productName');

        const lowStockProducts = await Product.find({
            quantity: { $lt: 10 },
            isBlocked: false,
            status: 'Available'
        })
            .sort({ quantity: 1 })
            .select('productName quantity salePrice')
            .limit(5);

        const salesChart = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $unwind: '$items' },
            { $match: { 'items.status': { $nin: ['Cancelled', 'Returned', 'Item Cancelled'] } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const currentRevenue = orderStats[0].currentPeriod[0]?.revenue || 0;
        const previousRevenue = orderStats[0].previousPeriod[0]?.revenue || 1;
        const revenueChange = ((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(1);

        const statusCounts = orderStats[0].statusCounts.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        res.render('dashboard', {
            stats: {
                currentRevenue,
                revenueChange,
                pendingOrders: statusCounts['Pending'] || 0,
                processingOrders: statusCounts['Processing'] || 0,
                shippedOrders: statusCounts['Shipped'] || 0,
                deliveredOrders: statusCounts['Delivered'] || 0,
                cancelledOrders: (statusCounts['Cancelled'] || 0) + (statusCounts['Item Cancelled'] || 0),
                returnedOrders: (statusCounts['Returned'] || 0) + (statusCounts['Item Return Requested'] || 0)
            },
            topProducts,
            topCategories,
            recentOrders,
            lowStockProducts,
            salesChart,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        });

    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).render('error', { message: 'Error loading dashboard' });
    }
};

module.exports = { getDashboard };