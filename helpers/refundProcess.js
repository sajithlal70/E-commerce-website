require('dotenv').config();
const Razorpay = require('razorpay');
const Wallet = require('../models/walletSchema');
const mongoose = require('mongoose');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const processRefund = async (paymentId, amount, metadata = {}) => {
    try {
        let refundResult;
        
        if (metadata.toWallet) {
            // Process refund to wallet
            refundResult = await creditToWallet(
                metadata.userId,
                amount / 100, // Convert paise to rupees
                {
                    ...metadata,
                    description: metadata.itemId ? 
                        `Refund for cancelled item from order #${metadata.orderId}` :
                        `Refund for cancelled order #${metadata.orderId}`,
                    transactionType: 'refund'
                }
            );
        } else {
            // Process Razorpay refund
            refundResult = await razorpay.payments.refund(paymentId, {
                amount: amount,
                speed: 'normal',
                notes: {
                    reason: metadata.reason || 'order_cancelled',
                    orderId: metadata.orderId || '',
                }
            });
        }

        // Create wallet transaction for tracking
        if (refundResult.success && metadata.userId) {
            const refundAmount = amount / 100; // Convert paise to rupees
            await createRefundTransaction(metadata.userId, refundAmount, metadata);
        }

        return {
            success: true,
            id: refundResult.id,
            amount: refundResult.amount,
            status: refundResult.status
        };
    } catch (error) {
        console.error('Refund processing error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

const creditToWallet = async (userId, amount, metadata = {}) => {
    try {
        // Find or create wallet
        let wallet = await Wallet.findOne({ userId: userId });
        if (!wallet) {
            wallet = new Wallet({
                userId: userId,
                balance: 0,
                walletId: generateWalletId()
            });
        }

        // Create transaction record
        const transaction = new WalletTransaction({
            userId: userId,
            type: 'credit',
            amount: amount,
            description: metadata.description || 'Refund credited to wallet',
            orderId: metadata.orderId,
            status: 'pending',
            balance: wallet.balance + amount,
            transactionType: metadata.transactionType || 'refund',
            metadata: {
                refundReason: metadata.reason,
                itemId: metadata.itemId,
                cancelledAt: new Date(),
                orderTotal: metadata.orderTotal
            }
        });

        // Use transaction session
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Update wallet balance
            wallet.balance += amount;
            wallet.transactions.push(transaction._id);

            // Save both documents
            await Promise.all([
                wallet.save({ session }),
                transaction.save({ session })
            ]);

            // Update transaction status to success
            transaction.status = 'success';
            await transaction.save({ session });

            await session.commitTransaction();
            return {
                success: true,
                id: transaction._id,
                amount: amount,
                status: 'completed'
            };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    } catch (error) {
        console.error('Wallet credit error:', error);
        throw error;
    }
};

const createRefundTransaction = async (userId, amount, metadata) => {
    try {
        const wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            throw new Error('Wallet not found');
        }

        const transaction = new WalletTransaction({
            user: userId,
            type: 'credit',
            amount: amount,
            description: metadata.itemId ? 
                `Refund for cancelled item from order #${metadata.orderId}` :
                `Refund for cancelled order #${metadata.orderId}`,
            orderId: metadata.orderId,
            status: 'success',
            balance: wallet.balance + amount,
            metadata: {
                refundReason: metadata.reason,
                itemId: metadata.itemId,
                cancelledAt: new Date(),
                orderTotal: metadata.orderTotal,
                transactionType: 'refund'
            }
        });

        // Use transaction session
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Update wallet balance
            wallet.balance += amount;
            wallet.transactions.push(transaction._id);

            // Save both documents
            await Promise.all([
                wallet.save({ session }),
                transaction.save({ session })
            ]);

            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

        return transaction;
    } catch (error) {
        console.error('Create refund transaction error:', error);
        throw error;
    }
};

module.exports = {
    processRefund,
    creditToWallet
}; 