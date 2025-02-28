const Wallet = require('../models/walletSchema');
const Transaction = require('../models/transactionSchema');
const mongoose = require('mongoose');

const processWalletTransaction = async (walletId, userId, type, amount, description, transactionType, balance, reference, orderId, paymentMethod) => {
    try {
        const transaction = await Transaction.create({
            walletId,
            userId,
            type,
            amount,
            description,
            transactionType,
            balance,
            reference,
            status: 'completed',
            orderId,
            paymentMethod: paymentMethod || 'wallet'  // Default to 'wallet' if not specified
        });
        return transaction;
    } catch (error) {
        console.error('Wallet transaction error:', error);
        throw error;
    }
};

module.exports = {
    processWalletTransaction
}; 