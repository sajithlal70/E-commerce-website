const Contact = require('../../models/contactSchema');
const Excel = require('exceljs');
const path = require('path');
const fs = require('fs');

// Contact Page Methods
const getContactPage = async (req, res) => {
    try {
        const categories = await require('../../models/categorySchema').find({ list: true });
        res.render('user/contact', { categories });
    } catch (error) {
        console.error('Error rendering contact page:', error);
        res.status(500).send('Internal Server Error');
    }
};

const createContact = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Create new contact entry
        const newContact = new Contact({
            name,
            email,
            subject,
            message,
            status: 'Pending'
        });

        // Save contact to database
        await newContact.save();

        // Excel file path
        const excelFilePath = path.join(__dirname, '../public/data/contact_submissions.xlsx');
        const dirPath = path.join(__dirname, '../public/data');

        // Create directory if it doesn't exist
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        let workbook;
        let worksheet;

        // Check if file exists
        if (fs.existsSync(excelFilePath)) {
            workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(excelFilePath);
            worksheet = workbook.getWorksheet('Contact Submissions');
        } else {
            // Create new workbook and worksheet
            workbook = new Excel.Workbook();
            worksheet = workbook.addWorksheet('Contact Submissions');
            
            // Add headers
            worksheet.columns = [
                { header: 'Date', key: 'date', width: 20 },
                { header: 'Name', key: 'name', width: 20 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Subject', key: 'subject', width: 30 },
                { header: 'Message', key: 'message', width: 50 },
                { header: 'Status', key: 'status', width: 15 }
            ];

            // Style the header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD3D3D3' }
            };
        }

        // Add new row
        worksheet.addRow({
            date: new Date().toLocaleString(),
            name,
            email,
            subject,
            message,
            status: 'Pending'
        });

        // Auto-fit columns
        worksheet.columns.forEach(column => {
            column.width = Math.max(column.width, 15);
        });

        // Save the workbook
        await workbook.xlsx.writeFile(excelFilePath);

        res.status(200).json({
            success: true,
            message: 'Your message has been sent successfully!'
        });

    } catch (error) {
        console.error('Error submitting contact form:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message. Please try again later.'
        });
    }
};

module.exports = {
    getContactPage,
    createContact
}; 