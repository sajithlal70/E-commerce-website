const Wallet = require('../../models/walletSchema');
const Transaction = require('../../models/transactionSchema');
const Category =require('../../models/categorySchema')
const crypto = require('crypto');
const mongoose = require('mongoose');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { processWalletTransaction } = require('../../helpers/walletHelper');

const generateWalletId = () => {
    return 'WAL' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-4).toUpperCase();
};

const generateTransactionReference = () => {
    return 'TXN' + Date.now().toString() + crypto.randomBytes(4).toString('hex');
};

const MIN_TRANSACTION = 1;
const MAX_TRANSACTION_LIMIT = 100000;

const getWalletPage = async (req, res) => {
    try {
        const userId = req.session.user._id;
        
        // Get wallet with transactions
        let wallet = await Wallet.findOne({ userId })
            .populate({
                path: 'transactions',
                model: 'Transaction',
                options: { sort: { createdAt: -1 } }
            });

        if (!wallet) {
            // Create new wallet if doesn't exist
            const walletId = 'WAL' + Date.now() + crypto.randomBytes(3).toString('hex').toUpperCase();
            wallet = new Wallet({
                userId,
                walletId,
                balance: 0,
                transactions: []
            });
            await wallet.save();
        }

        // Get all transactions using Transaction model and format them
        const transactions = await Transaction.find({ userId })
            .sort({ createdAt: -1 })
            .populate('orderId', 'orderStatus');

        // Format transactions to ensure balance exists
        const formattedTransactions = transactions.map(transaction => ({
            ...transaction.toObject(),
            balance: transaction.balance || 0,
            type: transaction.type,
            amount: transaction.amount,
            description: transaction.description,
            date: transaction.createdAt,
            status: transaction.status,
            transactionType: transaction.transactionType
        }));

        res.render('user/wallet-page', {
            wallet,
            transactions: formattedTransactions,
            user: req.session.user,
            categories: await Category.find({ status: 'Listed' })
        });

    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).render('error', { message: 'Error loading wallet' });
    }
};

const addMoney = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.session.user._id;

        const result = await processWalletTransaction(
            userId,
            parseFloat(amount),
            'credit',
            'Added money to wallet',
            {
                transactionType: 'deposit'
            }
        );

        res.json({
            success: true,
            message: 'Money added successfully',
            newBalance: result.newBalance
        });

    } catch (error) {
        console.error('Add money error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add money'
        });
    }
};

const withdrawMoney = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.session.user._id;

        const result = await processWalletTransaction(
            userId,
            parseFloat(amount),
            'debit',
            'Withdrawal from wallet',
            {
                transactionType: 'withdrawal'
            }
        );

        res.json({
            success: true,
            message: 'Money withdrawn successfully',
            newBalance: result.newBalance
        });

    } catch (error) {
        console.error('Withdraw money error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to withdraw money'
        });
    }
};

const getTransactions = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const transactions = await Transaction.find({ userId })
            .sort({ createdAt: -1 })
            .populate('orderId', 'orderStatus');

        res.json({
            success: true,
            transactions: transactions.map(t => ({
                type: t.type,
                amount: t.amount,
                description: t.description,
                date: t.createdAt,
                status: t.status,
                balance: t.balance,
                transactionType: t.transactionType
            }))
        });

    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions'
        });
    }
};

const processRefund = async (userId, amount, orderId, reason) => {
    try {
        // Find or create wallet
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = await Wallet.create({
                userId,
                balance: 0
            });
        }

        const newBalance = wallet.balance + amount;
        
        // Create transaction with all required fields
        const transaction = await Transaction.create({
            walletId: wallet._id,
            userId: userId,  // Make sure this is an ObjectId
            type: 'credit',
            amount: parseFloat(amount),  // Ensure amount is a number
            description: `Refund for order #${orderId}: ${reason}`,
            transactionType: 'refund',
            balance: newBalance,
            reference: `REF${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
            status: 'completed',
            orderId: orderId,
            paymentMethod: 'wallet'  // Default to wallet for refunds
        });

        // Update wallet balance
        wallet.balance = newBalance;
        await wallet.save();

        return transaction;
    } catch (error) {
        console.error('Process refund error:', error);
        throw error;
    }
};

const processWalletPayment = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, subtotal, shippingCost = 50, discountAmount = 0 } = req.body;

        // Calculate total payment amount
        const paymentAmount = subtotal + shippingCost - discountAmount;

        // Validate payment amount
        if (paymentAmount < MIN_TRANSACTION || paymentAmount > MAX_TRANSACTION_LIMIT) {
            return res.status(400).json({
                success: false,
                message: `Payment amount must be between ₹${MIN_TRANSACTION} and ₹${MAX_TRANSACTION_LIMIT}`
            });
        }

        // Get user's cart
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Get shipping address
        const address = await Address.findOne({
            userId,
            'addresses._id': addressId
        });

        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shipping address'
            });
        }

        const selectedAddress = address.addresses.id(addressId);

        // Create order
        const order = new Order({
            user: userId,
            items: cart.items.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.product.salePrice
            })),
            shippingAddress: selectedAddress,
            paymentMethod: 'wallet',
            subtotal,
            shippingCost,
            discountAmount,
            total: paymentAmount,
            orderStatus: 'Processing',
            paymentStatus: 'Pending'
        });

        await order.save();

        try {
            // Process wallet payment
            const paymentResult = await processWalletTransaction(
                userId,
                paymentAmount,
                'debit',
                `Payment for order #${order._id}`,
                {
                    orderId: order._id,
                    transactionType: 'payment'
                }
            );

            // Update product stock
            for (const item of cart.items) {
                const result = await Product.updateOne(
                    { 
                        _id: item.product._id,
                        quantity: { $gte: item.quantity }
                    },
                    { 
                        $inc: { quantity: -item.quantity }
                    }
                );

                if (result.modifiedCount === 0) {
                    throw new Error(`Failed to update stock for product ${item.product._id}`);
                }
            }

            // Update order status
            order.paymentStatus = 'Paid';
            order.paymentDetails = {
                paidAt: new Date(),
                transactionId: paymentResult.transaction._id
            };
            await order.save();

            // Clear cart
            await Cart.updateOne(
                { user: userId },
                { $set: { items: [] } }
            );

            // Clear applied coupon
            if (req.session.appliedCoupon) {
                delete req.session.appliedCoupon;
            }

            return res.json({
                success: true,
                message: 'Payment successful',
                orderId: order._id
            });

        } catch (error) {
            // If payment fails, delete the order and throw error
            await Order.findByIdAndDelete(order._id);
            throw error;
        }

    } catch (error) {
        console.error('Wallet payment error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Payment processing failed'
        });
    }
};

// Helper function to create order
const createOrder = async (userId, cart, addressId, paymentMethod, amount, couponCode) => {
    // ... existing order creation logic ...
};

module.exports = {
    getWalletPage,
    addMoney,
    withdrawMoney,
    getTransactions,
    processRefund,
    processWalletPayment
};  