const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');



const generateExcelReport = async (orders) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  worksheet.mergeCells('A1:H2');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'SALES REPORT';
  titleCell.font = { 
    size: 20, 
    bold: true, 
    color: { argb: '2B3674' }
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'F4F7FE' }
  };
  titleCell.alignment = { 
    horizontal: 'center', 
    vertical: 'middle' 
  };

  // Add date range
  worksheet.mergeCells('A3:H3');
  const dateCell = worksheet.getCell('A3');
  dateCell.value = `Generated on ${new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`;
  dateCell.font = { 
    size: 11, 
    color: { argb: '707EAE' }
  };
  dateCell.alignment = { horizontal: 'center' };

  // Add spacing
  worksheet.addRow([]);

  // Add headers with enhanced styling
  const headers = [
    'Order ID',
    'Date',
    'Items',
    'Amount (₹)',
    'Discount (₹)',
    'Coupon',
    'Net Amount (₹)',
    'Status'
  ];
  
  const headerRow = worksheet.addRow(headers);
  headerRow.height = 30;
  headerRow.font = { 
    bold: true, 
    color: { argb: 'FFFFFF' }
  };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '2B3674' }
  };
  headerRow.alignment = { 
    horizontal: 'center',
    vertical: 'middle'
  };

  // Style all cells in header row
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'E0E5F2' } },
      bottom: { style: 'thin', color: { argb: 'E0E5F2' } },
      left: { style: 'thin', color: { argb: 'E0E5F2' } },
      right: { style: 'thin', color: { argb: 'E0E5F2' } }
    };
  });

  // Add data with alternating row colors
  orders.forEach((order, index) => {
    const row = worksheet.addRow([
      order._id.toString(),
      new Date(order.createdAt).toLocaleDateString(),
      order.items.length,
      order.total.toFixed(2),
      order.discountAmount.toFixed(2),
      order.coupon?.code || '-',
      (order.total - order.discountAmount).toFixed(2),
      order.orderStatus
    ]);

    // Alternating row colors
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: index % 2 === 0 ? 'FFFFFF' : 'F4F7FE' }
    };

    row.alignment = { 
      horizontal: 'center',
      vertical: 'middle'
    };

    // Add border to each cell
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'E0E5F2' } },
        bottom: { style: 'thin', color: { argb: 'E0E5F2' } },
        left: { style: 'thin', color: { argb: 'E0E5F2' } },
        right: { style: 'thin', color: { argb: 'E0E5F2' } }
      };
    });

    // Style status cell
    const statusCell = row.getCell(8);
    switch(order.orderStatus.toLowerCase()) {
      case 'delivered':
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6F6D5' } };
        statusCell.font = { color: { argb: '2F855A' } };
        break;
      case 'pending':
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEEBC8' } };
        statusCell.font = { color: { argb: '744210' } };
        break;
      case 'cancelled':
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FED7D7' } };
        statusCell.font = { color: { argb: '9B2C2C' } };
        break;
    }
  });

  // Add spacing before summary
  worksheet.addRow([]);
  worksheet.addRow([]);

  // Calculate totals
  const totalAmount = orders.reduce((sum, order) => sum + order.total, 0);
  const totalDiscount = orders.reduce((sum, order) => sum + order.discountAmount, 0);
  const netAmount = totalAmount - totalDiscount;

  // Add summary section with enhanced styling
  const summaryData = [
    ['Total Orders:', orders.length],
    ['Total Amount:', `₹${totalAmount.toFixed(2)}`],
    ['Total Discount:', `₹${totalDiscount.toFixed(2)}`],
    ['Net Amount:', `₹${netAmount.toFixed(2)}`]
  ];

  // Style summary section
  summaryData.forEach(([label, value]) => {
    const row = worksheet.addRow([label, value]);
    row.font = { bold: true };
    row.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F4F7FE' }
    };
    row.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F4F7FE' }
    };
  });

  // Set column widths
  worksheet.columns.forEach((column, index) => {
    const maxLength = Math.max(
      ...orders.map(order => String(order[Object.keys(order)[index]] || '').length),
      headers[index].length
    );
    column.width = Math.min(Math.max(maxLength + 5, 15), 30);
  });

  return workbook;
};

const generatePDFReport = async (orders) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Add title with styling
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#2B3674')
         .text('SALES REPORT', { align: 'center' });

      // Add date
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#707EAE')
         .text(`Generated on ${new Date().toLocaleDateString('en-US', { 
           weekday: 'long', 
           year: 'numeric', 
           month: 'long', 
           day: 'numeric' 
         })}`, { 
           align: 'center' 
         });

      doc.moveDown(2);

      // Add summary with styled box
      const totalAmount = orders.reduce((sum, order) => sum + order.total, 0);
      const totalDiscount = orders.reduce((sum, order) => sum + order.discountAmount, 0);
      const netAmount = totalAmount - totalDiscount;

      // Draw summary box
      doc.rect(50, doc.y, 495, 100)
         .fillAndStroke('#F4F7FE', '#E0E5F2');

      const summaryY = doc.y + 20;
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2B3674');

      // Add summary content
      doc.text(`Total Orders: ${orders.length}`, 70, summaryY);
      doc.text(`Total Amount: ₹${totalAmount.toFixed(2)}`, 70, summaryY + 20);
      doc.text(`Total Discount: ₹${totalDiscount.toFixed(2)}`, 300, summaryY);
      doc.text(`Net Amount: ₹${netAmount.toFixed(2)}`, 300, summaryY + 20);

      doc.moveDown(4);

      // Add table headers with background
      const tableTop = doc.y;
      const columnHeaders = ['Order ID', 'Date', 'Items', 'Amount', 'Discount', 'Net Amount', 'Status'];
      const columnPositions = [50, 120, 190, 260, 330, 400, 470];
      const columnWidth = 65;

      // Draw header background
      doc.rect(50, tableTop - 5, 495, 25)
         .fillAndStroke('#2B3674', '#2B3674');

      // Add header text
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#FFFFFF');

      columnHeaders.forEach((header, i) => {
        doc.text(header, columnPositions[i], tableTop, {
          width: columnWidth,
          align: 'center'
        });
      });

      // Draw orders with alternating backgrounds
      let currentTop = tableTop + 30;
      doc.font('Helvetica').fontSize(9);

      orders.forEach((order, index) => {
        // Add new page if needed
        if (currentTop > 700) {
          doc.addPage();
          currentTop = 50;
          
          // Redraw headers on new page
          doc.rect(50, currentTop - 5, 495, 25)
             .fillAndStroke('#2B3674', '#2B3674');
             
          doc.fontSize(10)
             .font('Helvetica-Bold')
             .fillColor('#FFFFFF');

          columnHeaders.forEach((header, i) => {
            doc.text(header, columnPositions[i], currentTop, {
              width: columnWidth,
              align: 'center'
            });
          });

          currentTop += 30;
          doc.font('Helvetica').fontSize(9).fillColor('#2B3674');
        }

        // Draw row background
        if (index % 2 === 1) {
          doc.rect(50, currentTop - 5, 495, 20)
             .fillAndStroke('#F4F7FE', '#F4F7FE');
        }

        // Draw order data
        doc.fillColor('#2B3674');
        doc.text(order._id.toString().slice(-6), columnPositions[0], currentTop, { width: columnWidth, align: 'center' });
        doc.text(new Date(order.createdAt).toLocaleDateString(), columnPositions[1], currentTop, { width: columnWidth, align: 'center' });
        doc.text(order.items.length.toString(), columnPositions[2], currentTop, { width: columnWidth, align: 'center' });
        doc.text(`₹${order.total.toFixed(2)}`, columnPositions[3], currentTop, { width: columnWidth, align: 'center' });
        doc.text(`₹${order.discountAmount.toFixed(2)}`, columnPositions[4], currentTop, { width: columnWidth, align: 'center' });
        doc.text(`₹${(order.total - order.discountAmount).toFixed(2)}`, columnPositions[5], currentTop, { width: columnWidth, align: 'center' });

        // Style status based on value
        const status = order.orderStatus.toLowerCase();
        let statusColor = '#2B3674';
        if (status === 'delivered') statusColor = '#2F855A';
        if (status === 'pending') statusColor = '#744210';
        if (status === 'cancelled') statusColor = '#9B2C2C';

        doc.fillColor(statusColor)
           .text(order.orderStatus, columnPositions[6], currentTop, { width: columnWidth, align: 'center' });

        currentTop += 20;
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateExcelReport,
  generatePDFReport
};