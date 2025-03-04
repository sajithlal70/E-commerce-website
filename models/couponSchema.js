const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    description: {
        type: String,
        required: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountAmount: {
        type: Number,
        required: true,
        min: 0
    },
    minPurchase: {
        type: Number,
        required: true,
        min: 0
    },
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    maxUsagePerUser: {
        type: Number,
        required: true,
        min: 1
    },
    totalUsageLimit: {
        type: Number,
        required: true,
        min: 1
    },
    currentUsageCount: {
        type: Number,
        default: 0
    },
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usageCount: {
            type: Number,
            default: 0
        }
    }]
}, { timestamps: true });

couponSchema.pre('save', function(next) {
    const currentDate = new Date();
    if (this.validUntil < currentDate) {
        this.status = 'inactive';
    }
    if (this.currentUsageCount >= this.totalUsageLimit) {
        this.status = 'inactive';
    }
    next();
});

couponSchema.methods.isValidForUser = async function(userId, cartTotal) {
    if (this.status !== 'active') {
        return { isValid: false, message: `This coupon is ${this.status}` };
    }

    const currentDate = new Date();
    if (currentDate < this.validFrom || currentDate > this.validUntil) {
        return { isValid: false, message: 'This coupon has expired' };
    }

    if (cartTotal < this.minPurchase) {
        return { isValid: false, message: `Minimum purchase amount of ₹${this.minPurchase} required` };
    }

    const userUsage = this.usedBy.find(usage => usage.userId.toString() === userId.toString());
    const userUsageCount = userUsage ? userUsage.usageCount : 0;
    if (userUsageCount >= this.maxUsagePerUser) {
        return { 
            isValid: false, 
            message: `You have reached the maximum usage limit (${this.maxUsagePerUser}) for this coupon`
        };
    }

    if (this.currentUsageCount >= this.totalUsageLimit) {
        return { isValid: false, message: 'This coupon has reached its total usage limit' };
    }

    return { isValid: true, message: 'Coupon is valid' };
};

couponSchema.methods.validateForOrder = async function(userId, cartTotal) {
    try {
        const validationResult = await this.isValidForUser(userId, cartTotal);
        if (!validationResult.isValid) {
            return validationResult;
        }

        const { discountAmount, finalPrice } = this.calculateDiscount(cartTotal);

        return {
            isValid: true,
            message: 'Coupon is valid for order',
            discountAmount,
            finalPrice,
            discountType: this.discountType,
            code: this.code
        };
    } catch (error) {
        console.error('Error validating coupon for order:', error);
        return { isValid: false, message: 'Error validating coupon' };
    }
};

couponSchema.methods.calculateDiscount = function(cartTotal) {
    let discountAmount = 0;
    if (this.discountType === 'percentage') {
        discountAmount = (cartTotal * this.discountAmount) / 100;
    } else {
        discountAmount = this.discountAmount;
    }
    discountAmount = Math.min(discountAmount, cartTotal);
    const finalPrice = cartTotal - discountAmount;
    return { discountAmount, finalPrice };
};

couponSchema.methods.updateUsage = async function(userId) {
    try {
        const userIndex = this.usedBy.findIndex(usage => 
            usage.userId.toString() === userId.toString()
        );
        
        if (userIndex >= 0) {
            if (this.usedBy[userIndex].usageCount >= this.maxUsagePerUser) {
                return {
                    success: false,
                    message: `Maximum usage limit (${this.maxUsagePerUser}) reached for this user`
                };
            }
            this.usedBy[userIndex].usageCount += 1;
        } else {
            this.usedBy.push({ userId: userId, usageCount: 1 });
        }
        
        this.currentUsageCount += 1;
        if (this.currentUsageCount >= this.totalUsageLimit) {
            this.status = 'inactive';
        }
        
        await this.save();
        
        return { success: true, message: 'Coupon usage updated successfully' };
    } catch (error) {
        console.error('Error updating coupon usage:', error);
        return { success: false, message: 'Failed to update coupon usage' };
    }
};

couponSchema.index({ status: 1, validFrom: 1, validUntil: 1 });
couponSchema.index({ 'usedBy.userId': 1 });

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;