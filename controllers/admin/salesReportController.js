const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Order = require('../../models/orderSchema');
const { generateExcelReport, generatePDFReport } = require('../../helpers/salesReportHelpers');

const getReport = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    let dateRange = {
      start: startDate || new Date().toISOString().split('T')[0],
      end: endDate || new Date().toISOString().split('T')[0]
    };

    if (filter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      switch (filter) {
        case 'daily':
          dateRange = {
            start: today.toISOString().split('T')[0],
            end: today.toISOString().split('T')[0]
          };
          break;

        case 'weekly':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          const weekEnd = new Date(today);
          weekEnd.setDate(weekStart.getDate() + 6);

          dateRange = {
            start: weekStart.toISOString().split('T')[0],
            end: weekEnd.toISOString().split('T')[0]
          };
          break;

        case 'monthly':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

          dateRange = {
            start: monthStart.toISOString().split('T')[0],
            end: monthEnd.toISOString().split('T')[0]
          };
          break;
      }
    }

    if (!dateRange.start || !dateRange.end) {
      const today = new Date().toISOString().split('T')[0];
      dateRange = {
        start: today,
        end: today
      };
    }

    // Get basic stats - Only for delivered orders
    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(dateRange.start),
            $lte: new Date(dateRange.end)
          },
          orderStatus: "Delivered" // Only count delivered orders
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: { $sum: '$total' },
          totalDiscount: { $sum: '$discountAmount' },
          netSales: { $sum: { $subtract: ['$total', '$discountAmount'] } }
        }
      }
    ]);

    const defaultStats = {
      totalOrders: 0,
      totalSales: 0,
      totalDiscount: 0,
      netSales: 0
    };

    const finalStats = stats.length > 0 ? stats[0] : defaultStats;

    // Get delivered orders list with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const orders = await Order.find({
      createdAt: {
        $gte: new Date(dateRange.start),
        $lte: new Date(dateRange.end)
      },
      orderStatus: "Delivered" // Only get delivered orders
    })
      .populate('items.product')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination - Only delivered orders
    const totalOrders = await Order.countDocuments({
      createdAt: {
        $gte: new Date(dateRange.start),
        $lte: new Date(dateRange.end)
      },
      orderStatus: "Delivered"
    });

    // Calculate growth percentages - Only for delivered orders
    const previousPeriodStats = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(getPreviousPeriod(dateRange.start)),
            $lte: new Date(dateRange.start)
          },
          orderStatus: "Delivered"
        }
      },
      {
        $group: {
          _id: null,
          previousTotalOrders: { $sum: 1 },
          previousTotalSales: { $sum: '$totalAmount' },
          previousTotalDiscount: { $sum: '$discountAmount' },
          previousNetSales: { $sum: { $subtract: ['$totalAmount', '$discountAmount'] } }
        }
      }
    ]);

    const defaultGrowth = {
      orders: 0,
      sales: 0,
      discount: 0,
      netSales: 0
    };

    const growth = calculateGrowth(finalStats, previousPeriodStats[0]) || defaultGrowth;

    res.render('sales-report', {
      stats: finalStats,
      orders: orders || [],
      growth,
      pagination: {
        current: page,
        pages: Math.ceil(totalOrders / limit),
        total: totalOrders
      },
      dateRange,
      activeFilter: filter || 'custom'
    });

  } catch (error) {
    console.error('Error in getSalesReport:', error);
    res.render('sales-report', {
      stats: {
        totalOrders: 0,
        totalSales: 0,
        totalDiscount: 0,
        netSales: 0
      },
      orders: [],
      growth: {
        orders: 0,
        sales: 0,
        discount: 0,
        netSales: 0
      },
      pagination: {
        current: 1,
        pages: 1,
        total: 0
      },
      dateRange: {
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    });
  }
};

const exportSalesReport = async (req, res) => {
  try {
    const { format, startDate, endDate } = req.query;

    const orders = await Order.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      orderStatus: "Delivered" // Only export delivered orders
    }).populate('items.product');

    if (format === 'excel') {
      const workbook = await generateExcelReport(orders);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
      await workbook.xlsx.write(res);
    } else if (format === 'pdf') {
      const pdfBuffer = await generatePDFReport(orders);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
      res.send(pdfBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format specified' });
    }
  } catch (error) {
    console.error('Error in exportSalesReport:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper functions remain the same
function getPreviousPeriod(date) {
  const current = new Date(date);
  current.setDate(current.getDate() - current.getDate());
  return current.toISOString().split('T')[0];
}

function calculateGrowth(current, previous) {
  if (!current || !previous) return {
    orders: 0,
    sales: 0,
    discount: 0,
    netSales: 0
  };

  return {
    orders: calculatePercentageChange(current.totalOrders, previous.previousTotalOrders),
    sales: calculatePercentageChange(current.totalSales, previous.previousTotalSales),
    discount: calculatePercentageChange(current.totalDiscount, previous.previousTotalDiscount),
    netSales: calculatePercentageChange(current.netSales, previous.previousNetSales)
  };
}

function calculatePercentageChange(current, previous) {
  if (!previous) return 0;
  return ((current - previous) / previous * 100).toFixed(1);
}

module.exports = {
  getReport,
  exportSalesReport,
}