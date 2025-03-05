const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Order = require('../../models/orderSchema');
const { generateExcelReport, generatePDFReport } = require('../../helpers/salesReportHelpers');

const getReport = async (req, res) => {
  try {
    const { filter, startDate, endDate, page = 1 } = req.query;
    const limit = parseInt(req.query.limit) || 10; 
    const skip = (page - 1) * limit;

    // Date range calculation
    let dateRange = {
      start: startDate || new Date().toISOString().split('T')[0],
      end: endDate || new Date().toISOString().split('T')[0]
    };

    if (filter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      switch (filter) {
        case 'daily':
          dateRange = { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
          break;
        case 'weekly':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          dateRange = { start: weekStart.toISOString().split('T')[0], end: weekEnd.toISOString().split('T')[0] };
          break;
        case 'monthly':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          dateRange = { start: monthStart.toISOString().split('T')[0], end: monthEnd.toISOString().split('T')[0] };
          break;
        default:
          if (!startDate || !endDate) throw new Error('Invalid date range');
      }
    }

    // Validate dates
    if (new Date(dateRange.start) > new Date(dateRange.end)) {
      [dateRange.start, dateRange.end] = [dateRange.end, dateRange.start]; // Swap if start > end
    }

    // Stats for delivered orders
    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(dateRange.start), $lte: new Date(dateRange.end) },
          orderStatus: 'Delivered'
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: { $sum: '$total' }, // Fixed from totalAmount
          totalDiscount: { $sum: '$discountAmount' },
          netSales: { $sum: { $subtract: ['$total', '$discountAmount'] } }
        }
      }
    ]);

    const finalStats = stats[0] || { totalOrders: 0, totalSales: 0, totalDiscount: 0, netSales: 0 };

    // Fetch orders
    const orders = await Order.find({
      createdAt: { $gte: new Date(dateRange.start), $lte: new Date(dateRange.end) },
      orderStatus: 'Delivered'
    })
      .populate('items.product')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments({
      createdAt: { $gte: new Date(dateRange.start), $lte: new Date(dateRange.end) },
      orderStatus: 'Delivered'
    });

    // Previous period stats
    const previousRange = getPreviousPeriod(dateRange, filter);
    const previousStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(previousRange.start), $lte: new Date(previousRange.end) },
          orderStatus: 'Delivered'
        }
      },
      {
        $group: {
          _id: null,
          previousTotalOrders: { $sum: 1 },
          previousTotalSales: { $sum: '$total' }, // Fixed from totalAmount
          previousTotalDiscount: { $sum: '$discountAmount' },
          previousNetSales: { $sum: { $subtract: ['$total', '$discountAmount'] } }
        }
      }
    ]);

    const growth = calculateGrowth(finalStats, previousStats[0] || {});

    res.render('sales-report', {
      stats: finalStats,
      orders,
      growth,
      pagination: { current: parseInt(page), pages: Math.ceil(totalOrders / limit), total: totalOrders, limit },
      dateRange,
      activeFilter: filter || 'custom'
    });
  } catch (error) {
    console.error('Error in getSalesReport:', error);
    res.status(500).render('sales-report', {
      stats: { totalOrders: 0, totalSales: 0, totalDiscount: 0, netSales: 0 },
      orders: [],
      growth: { orders: 0, sales: 0, discount: 0, netSales: 0 },
      pagination: { current: 1, pages: 1, total: 0, limit: 10 },
      dateRange: { start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] },
      activeFilter: 'custom',
      error: error.message
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
      orderStatus: 'Delivered'
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
};

// Helper functions
function getPreviousPeriod(dateRange, filter) {
  const start = new Date(dateRange.start);
  let previousStart, previousEnd;

  switch (filter) {
    case 'daily':
      previousStart = new Date(start);
      previousStart.setDate(start.getDate() - 1);
      previousEnd = previousStart;
      break;
    case 'weekly':
      previousStart = new Date(start);
      previousStart.setDate(start.getDate() - 7);
      previousEnd = new Date(previousStart);
      previousEnd.setDate(previousStart.getDate() + 6);
      break;
    case 'monthly':
      previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      previousEnd = new Date(start.getFullYear(), start.getMonth(), 0);
      break;
    default:
      previousStart = new Date(start);
      previousStart.setDate(start.getDate() - (start.getDate() - 1)); // Default to start of month
      previousEnd = new Date(start);
      previousEnd.setDate(start.getDate() - 1);
  }

  return {
    start: previousStart.toISOString().split('T')[0],
    end: previousEnd.toISOString().split('T')[0]
  };
}

function calculateGrowth(current, previous) {
  return {
    orders: calculatePercentageChange(current.totalOrders, previous.previousTotalOrders || 0),
    sales: calculatePercentageChange(current.totalSales, previous.previousTotalSales || 0),
    discount: calculatePercentageChange(current.totalDiscount, previous.previousTotalDiscount || 0),
    netSales: calculatePercentageChange(current.netSales, previous.previousNetSales || 0)
  };
}

function calculatePercentageChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous * 100).toFixed(1);
}

module.exports = {
  getReport,
  exportSalesReport,
};