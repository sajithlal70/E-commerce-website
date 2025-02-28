const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    walletId: {
        type: String,
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    transactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Add method to credit amount
walletSchema.methods.credit = async function(amount) {
    this.balance += amount;
    return this.save();
};

// Add method to debit amount
walletSchema.methods.debit = async function(amount) {
    if (this.balance < amount) {
        throw new Error('Insufficient balance');
    }
    this.balance -= amount;
    return this.save();
};

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet; 

