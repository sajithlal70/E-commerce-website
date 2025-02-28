const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Order = require('../models/orderSchema')

const generateInvoice = async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await Order.findById(orderId)
        .populate('items.product')
        .populate('user', 'email');

        console.log(order);
        
  
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      // Create invoices directory if it doesn't exist
      const invoicesDir = path.join(__dirname, '../public/invoices');
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }
  
      // Create PDF document
      const doc = new PDFDocument({
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        size: 'A4'
      });
      const fileName = `invoice-${order._id}.pdf`;
      const filePath = path.join(invoicesDir, fileName);
  
      // Create write stream
      const writeStream = fs.createWriteStream(filePath);
  
      // Handle stream errors
      writeStream.on('error', (error) => {
        console.error('Write stream error:', error);
        return res.status(500).json({ message: 'Error generating invoice' });
      });
  
      // Pipe PDF to writable stream
      doc.pipe(writeStream);
  
      // Add INVOICE title
      const pageWidth = doc.page.width; // Get the page width
      doc.fontSize(35).font('Helvetica-Bold').text('INVOICE', 0, 55, { align: 'center', width: pageWidth });
      // Add a horizontal line at the top
      doc.moveTo(50, 50).lineTo(545, 50).stroke();
      doc.moveDown(2);
  
      // Left column - Customer Details
      doc.font('Helvetica-Bold').fontSize(12).text('ISSUED TO:', 50, 150);
      doc.font('Helvetica').fontSize(11).text(order.shippingAddress.name, 50, 170);
      doc.text(order.user?.email || 'Customer');
      doc.text(order.shippingAddress.address);
      if (order.shippingAddress.apartment) {
        doc.text(order.shippingAddress.apartment);
      }
      doc.text(`${order.shippingAddress.city},${order.shippingAddress.postalCode}`);
  
      // Right column - Invoice Details
      doc.font('Helvetica-Bold').fontSize(12).text('INVOICE NO:', 400, 150);
      doc.font('Helvetica').fontSize(11).text(order._id.toString().substring(0, 5), 490, 150, { align: 'right' });
      
      doc.font('Helvetica-Bold').text('DATE:', 400, 170);
      doc.font('Helvetica').text(new Date(order.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }), 490, 170, { align: 'right' });
      
      doc.font('Helvetica-Bold').text('DUE DATE:', 400, 190);
      // Set due date to 30 days from creation
      const dueDate = new Date(order.createdAt);
      dueDate.setDate(dueDate.getDate() + 30);
      doc.font('Helvetica').text(dueDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }), 490, 190, { align: 'right' });
  
      // Payment Details
      doc.font('Helvetica-Bold').fontSize(12).text('PAY TO:', 50, 240);
      doc.font('Helvetica-Bold').fontSize(11).text(`Payment Method: ${order.paymentMethod}`, 50, 260);
      doc.font('Helvetica-Bold').fontSize(11).text(`Payment Status : ${order.paymentStatus}`);
      doc.font('Helvetica-Bold').fontSize(11).text(`Order Status: ${order.orderStatus}`);
  
      // Items Table
      doc.moveDown(4);
      const tableTop = 340;
      const tableWidth = 495;
      
      // Table Headers
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('DESCRIPTION', 50, tableTop);
      doc.text('UNIT PRICE', 290, tableTop, { width: 80, align: 'right' });
      doc.text('QTY', 380, tableTop, { width: 40, align: 'right' });
      doc.text('TOTAL', 430, tableTop, { width: 65, align: 'right' });
      
      // Table divider
      doc.moveTo(50, tableTop + 20).lineTo(545, tableTop + 20).stroke();
  
      // Table Content
      let currentY = tableTop + 30;
      doc.font('Helvetica').fontSize(10);
      
      order.items.forEach(item => {
        doc.text(item.product.productName, 50, currentY, { width: 230 });
        doc.text(`₹${item.price.toFixed(2)}`, 290, currentY, { width: 80, align: 'right' });
        doc.text(item.quantity.toString(), 380, currentY, { width: 40, align: 'right' });
        doc.text(`₹${(item.price * item.quantity).toFixed(2)}`, 430, currentY, { width: 65, align: 'right' });
        currentY += 25;
      });
  
      // Bottom divider
      currentY += 10;
      doc.moveTo(50, currentY).lineTo(545, currentY).stroke();
      currentY += 20;
  
      // Subtotal
      doc.font('Helvetica-Bold').fontSize(11).text('SUBTOTAL', 350, currentY);
      doc.font('Helvetica').text(`₹${order.subtotal.toFixed(2)}`, 495, currentY, { align: 'right' });
      currentY += 20;
  
 
      doc.text('Shipping Charge', 350, currentY);
      doc.text(`₹${order.shippingCost}`, 495, currentY, { align: 'right' });
      currentY += 20;
  
      // Discount if applicable
      if (order.coupon) {
        doc.text(`Discount `, 350, currentY);
        doc.text(`-₹${order.discountAmount.toFixed(2)}`, 495, currentY, { align: 'right' });
        currentY += 20;
      }
  
      // Total
      doc.font('Helvetica-Bold').text('TOTAL', 350, currentY);
      doc.text(`₹${order.total.toFixed(2)}`, 495, currentY, { align: 'right' });
  
      // Signature
      const signatureY = currentY + 80;
      doc.font('Helvetica').fontSize(10).text('Authorized Signature:', 350, signatureY);
      
      // Add simple signature line
      doc.moveTo(350, signatureY + 40).lineTo(545, signatureY + 40).stroke();
  
      // Finalize PDF
      doc.end();
  
      // Wait for the write stream to finish
      writeStream.on('finish', () => {
        // Send file to client
        res.download(filePath, fileName, (err) => {
          if (err) {
            console.error('Download error:', err);
            return res.status(500).json({ message: 'Error downloading invoice' });
          }
          // Delete file after download
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
          });
        });
      });
  
    } catch (error) {
      console.error('Invoice generation error:', error);
      res.status(500).json({ message: 'Error generating invoice' });
    }
  };

module.exports = {
  generateInvoice
}