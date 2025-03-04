const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Order = require('../models/orderSchema');

const generateInvoice = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId)
            .populate('items.product')
            .populate('user', 'email name');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.status(403).json({ message: 'Invoice available only for delivered orders' });
        }

        const invoicesDir = path.join(__dirname, '../public/invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const doc = new PDFDocument({
            margins: { top: 50, bottom: 50, left: 50, right: 50 },
            size: 'A4'
        });
        const fileName = `invoice-${order._id}.pdf`;
        const filePath = path.join(invoicesDir, fileName);
        const writeStream = fs.createWriteStream(filePath);

        writeStream.on('error', (error) => {
            console.error('Write stream error:', error);
            return res.status(500).json({ message: 'Error generating invoice' });
        });

        doc.pipe(writeStream);

        // Define Colors
        const primaryColor = '#2C3E50'; // Dark Blue-Gray for headers
        const secondaryColor = '#3498DB'; // Light Blue for accents
        const accentColor = '#E74C3C'; // Red for emphasis
        const textColor = '#333333'; // Dark Gray for text
        const lineColor = '#BDC3C7'; // Light Gray for lines

        // Header with Background
        doc.rect(0, 0, doc.page.width, 100)
           .fill(secondaryColor)
           .stroke();
        doc.fontSize(35)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF') // White text
           .text('INVOICE', 0, 55, { align: 'center', width: doc.page.width });
        doc.moveTo(50, 100).lineTo(545, 100).lineWidth(2).strokeColor(lineColor).stroke();

        // Customer Details Section
        doc.fillColor(primaryColor)
           .font('Helvetica-Bold')
           .fontSize(12)
           .text('ISSUED TO:', 50, 130);
        doc.fillColor(textColor)
           .font('Helvetica')
           .fontSize(11)
           .text(order.shippingAddress.name, 50, 150)
           .text(order.user?.email || 'Customer')
           .text(order.shippingAddress.street)
           .text(order.shippingAddress.landMark || '')
           .text(`${order.shippingAddress.city}, ${order.shippingAddress.postalCode}`);

        // Invoice Details Section with Background
        doc.rect(390, 120, 155, 80)
           .fill('#ECF0F1') // Light Gray background
           .stroke();
        doc.fillColor(primaryColor)
           .font('Helvetica-Bold')
           .fontSize(12)
           .text('INVOICE NO:', 400, 130);
        doc.fillColor(textColor)
           .font('Helvetica')
           .fontSize(11)
           .text(order._id.toString().substring(0, 5), 490, 130, { align: 'right' });
        doc.fillColor(primaryColor)
           .text('DATE:', 400, 150);
        doc.fillColor(textColor)
           .text(new Date(order.createdAt).toLocaleDateString('en-GB'), 490, 150, { align: 'right' });
        doc.fillColor(primaryColor)
           .text('DELIVERED:', 400, 170);
        doc.fillColor(accentColor) // Red for delivered date
           .text(new Date(order.deliveredAt).toLocaleDateString('en-GB'), 490, 170, { align: 'right' });

        // Payment Details
        doc.fillColor(primaryColor)
           .font('Helvetica-Bold')
           .fontSize(12)
           .text('PAYMENT DETAILS:', 50, 220);
        doc.fillColor(textColor)
           .font('Helvetica')
           .fontSize(11)
           .text(`Payment Method: ${order.paymentMethod}`, 50, 240)
           .text(`Payment Status: ${order.paymentStatus}`);

        // Items Table with Colored Header
        const tableTop = 300;
        doc.rect(50, tableTop - 10, 495, 30)
           .fill(secondaryColor)
           .stroke();
        doc.fillColor('#FFFFFF')
           .font('Helvetica-Bold')
           .fontSize(11)
           .text('DESCRIPTION', 55, tableTop, { width: 230 })
           .text('UNIT PRICE', 290, tableTop, { width: 80, align: 'right' })
           .text('QTY', 380, tableTop, { width: 40, align: 'right' })
           .text('TOTAL', 430, tableTop, { width: 65, align: 'right' });
        doc.moveTo(50, tableTop + 20).lineTo(545, tableTop + 20).lineWidth(1).strokeColor(lineColor).stroke();

        // Table Rows with Alternating Colors
        let currentY = tableTop + 30;
        doc.font('Helvetica').fontSize(10);
        order.items.forEach((item, index) => {
            const rowColor = index % 2 === 0 ? '#F9FAFB' : '#FFFFFF'; // Alternate light gray and white
            doc.rect(50, currentY - 5, 495, 25).fill(rowColor).stroke();
            doc.fillColor(textColor)
               .text(item.product.productName, 55, currentY, { width: 230 })
               .text(`₹${item.price.toFixed(2)}`, 290, currentY, { width: 80, align: 'right' })
               .text(item.quantity.toString(), 380, currentY, { width: 40, align: 'right' })
               .text(`₹${(item.price * item.quantity).toFixed(2)}`, 430, currentY, { width: 65, align: 'right' });
            currentY += 25;
        });

        currentY += 10;
        doc.moveTo(50, currentY).lineTo(545, currentY).lineWidth(2).strokeColor(lineColor).stroke();
        currentY += 20;

        // Summary Section with Colored Total
        doc.fillColor(primaryColor)
           .font('Helvetica-Bold')
           .fontSize(11)
           .text('SUBTOTAL', 350, currentY);
        doc.fillColor(textColor)
           .font('Helvetica')
           .text(`₹${order.subtotal.toFixed(2)}`, 495, currentY, { align: 'right' });
        currentY += 20;

        doc.fillColor(primaryColor)
           .text('SHIPPING', 350, currentY);
        doc.fillColor(textColor)
           .text(`₹${order.shippingCost.toFixed(2)}`, 495, currentY, { align: 'right' });
        currentY += 20;

        if (order.discountAmount > 0) {
            doc.fillColor(primaryColor)
               .text('DISCOUNT', 350, currentY);
            doc.fillColor(accentColor) // Red for discount
               .text(`-₹${order.discountAmount.toFixed(2)}`, 495, currentY, { align: 'right' });
            currentY += 20;
        }

        doc.rect(345, currentY - 5, 200, 25)
           .fill(secondaryColor)
           .stroke();
        doc.fillColor('#FFFFFF')
           .font('Helvetica-Bold')
           .text('TOTAL', 350, currentY);
        doc.fillColor('#FFFFFF')
           .text(`₹${order.total.toFixed(2)}`, 495, currentY, { align: 'right' });

        // Footer Line
        doc.moveTo(50, doc.page.height - 60)
           .lineTo(545, doc.page.height - 60)
           .lineWidth(2)
           .strokeColor(lineColor)
           .stroke();

        doc.end();

        writeStream.on('finish', () => {
            res.download(filePath, fileName, (err) => {
                if (err) {
                    console.error('Download error:', err);
                    return res.status(500).json({ message: 'Error downloading invoice' });
                }
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

module.exports = { generateInvoice };