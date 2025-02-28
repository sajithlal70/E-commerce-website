const Contact = require('../../models/contactSchema');
const nodemailer = require('nodemailer');

const contactController = {
    // Render contact page
    getContactPage: async (req, res) => {
        try {
            res.render('user/contact', {
                categories: await require('../../models/categorySchema').find({ list: true })
            });
        } catch (error) {
            console.error('Error rendering contact page:', error);
            res.status(500).send('Internal Server Error');
        }
    },

    // Handle contact form submission
    createContact: async (req, res) => {
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

            // Send email notification
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.NODEMAILER_EMAIL,
                    pass: process.env.NODEMAILER_PASSWORD
                }
            });

            // Email to admin
            const adminMailOptions = {
                from: process.env.NODEMAILER_EMAIL,
                to: process.env.NODEMAILER_EMAIL, // Using same email as sender for admin notifications
                subject: `New Contact Form Submission: ${subject}`,
                html: `
                    <h2>New Contact Form Submission</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong> ${message}</p>
                `
            };

            // Auto-reply to user
            const userMailOptions = {
                from: process.env.NODEMAILER_EMAIL,
                to: email,
                subject: 'Thank you for contacting us',
                html: `
                    <h2>Thank you for contacting us!</h2>
                    <p>Dear ${name},</p>
                    <p>We have received your message and will get back to you as soon as possible.</p>
                    <p>Your message details:</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong> ${message}</p>
                    <br>
                    <p>Best regards,</p>
                    <p>DentKart Team</p>
                `
            };

            // Send emails
            await transporter.sendMail(adminMailOptions);
            await transporter.sendMail(userMailOptions);

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
    }
};

module.exports = contactController; 