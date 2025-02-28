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

couponSchema.pre('save', function (next) {
    const currentDate = new Date();
    if (this.validUntil < currentDate) {
        this.status = 'expired';
    }
    if (this.currentUsageCount >= this.totalUsageLimit) {
        this.status = 'disabled';
    }
    next();
});

couponSchema.methods.isValidForUser = async function(userId, cartTotal) {
    if (this.status !== 'active') {
        return {
            isValid: false,
            message: `This coupon is ${this.status}`
        };
    }

    const currentDate = new Date();
    if (currentDate < this.validFrom || currentDate > this.validUntil) {
        return {
            isValid: false,
            message: 'This coupon has expired'
        };
    }

    if (cartTotal < this.minPurchase) {
        return {
            isValid: false,
            message: `Minimum purchase amount of ₹${this.minPurchase} required`
        };
    }

    const userUsage = this.usedBy.find(usage => usage.userId.toString() === userId.toString());
    if (userUsage && userUsage.usageCount >= this.maxUsagePerUser) {
        return {
            isValid: false,
            message: 'You have reached the maximum usage limit for this coupon'
        };
    }

    if (this.currentUsageCount >= this.totalUsageLimit) {
        return {
            isValid: false,
            message: 'This coupon has reached its total usage limit'
        };
    }

    return {
        isValid: true,
        message: 'Coupon is valid'
    };
};

couponSchema.methods.calculateDiscount = function(cartTotal) {
    let discountAmount = 0;
    let finalPrice = cartTotal;

    if (this.discountType === 'percentage') {
        // Ensure percentage is not more than 90%
        const cappedPercentage = Math.min(this.discountAmount, 90);
        discountAmount = (cartTotal * cappedPercentage) / 100;
        
        // Cap the maximum discount at ₹5000 or cart total, whichever is lower
        const maxDiscount = Math.min(5000, cartTotal);
        discountAmount = Math.min(discountAmount, maxDiscount);
    } else { // fixed amount
        // For fixed amount, don't allow discount more than cart total
        discountAmount = Math.min(this.discountAmount, cartTotal);
    }

    // Ensure final price is not negative and round to 2 decimal places
    finalPrice = Math.max(0, parseFloat((cartTotal - discountAmount).toFixed(2)));
    discountAmount = parseFloat(discountAmount.toFixed(2));

    return {
        discountAmount,
        finalPrice,
        discountType: this.discountType,
        code: this.code
    };
};

couponSchema.methods.updateUsage = async function(userId) {
    try {
        // Find if user has used this coupon before
        const userUsageIndex = this.usedBy.findIndex(
            usage => usage.userId.toString() === userId.toString()
        );

        const currentDate = new Date();

        if (userUsageIndex === -1) {
            // First time user is using this coupon
            this.usedBy.push({
                userId,
                usageCount: 1,
                lastUsedAt: currentDate
            });
        } else {
            // User has used this coupon before
            if (this.usedBy[userUsageIndex].usageCount >= this.maxUsagePerUser) {
                throw new Error('Maximum usage limit reached for this user');
            }
            this.usedBy[userUsageIndex].usageCount += 1;
            this.usedBy[userUsageIndex].lastUsedAt = currentDate;
        }

        // Increment total usage count
        this.currentUsageCount += 1;

        // Check if coupon should be disabled
        if (this.currentUsageCount >= this.totalUsageLimit) {
            this.status = 'disabled';
        }

        // Save the updated coupon
        await this.save();

        return {
            success: true,
            message: 'Coupon usage updated successfully',
            usageCount: userUsageIndex === -1 ? 1 : this.usedBy[userUsageIndex].usageCount,
            totalUsageCount: this.currentUsageCount,
            status: this.status
        };
    } catch (error) {
        console.error('Error updating coupon usage:', error);
        throw new Error(error.message || 'Failed to update coupon usage');
    }
};

// Add a method to validate coupon before order creation
couponSchema.methods.validateForOrder = async function(userId, cartTotal) {
    try {
        // First check if coupon is still valid
        const validationResult = await this.isValidForUser(userId, cartTotal);
        if (!validationResult.isValid) {
            return validationResult;
        }

        // Check if adding one more usage would exceed limits
        const userUsage = this.usedBy.find(usage => usage.userId.toString() === userId.toString());
        const currentUserUsage = userUsage ? userUsage.usageCount : 0;

        if (currentUserUsage + 1 > this.maxUsagePerUser) {
            return {
                isValid: false,
                message: 'You have reached the maximum usage limit for this coupon'
            };
        }

        if (this.currentUsageCount + 1 > this.totalUsageLimit) {
            return {
                isValid: false,
                message: 'This coupon has reached its total usage limit'
            };
        }

        // Calculate potential discount
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
        return {
            isValid: false,
            message: 'Error validating coupon'
        };
    }
};

// Add a static method to find valid coupons for a user and cart total
couponSchema.statics.findValidCoupons = async function(userId, cartTotal) {
    try {
        const currentDate = new Date();
        const coupons = await this.find({
            status: 'active',
            validFrom: { $lte: currentDate },
            validUntil: { $gt: currentDate },
            minPurchase: { $lte: cartTotal },
            $expr: { $lt: ['$currentUsageCount', '$totalUsageLimit'] }
        });

        const validCoupons = await Promise.all(
            coupons.map(async (coupon) => {
                const userUsage = coupon.usedBy.find(usage => 
                    usage.userId.toString() === userId.toString()
                );

                if (userUsage && userUsage.usageCount >= coupon.maxUsagePerUser) {
                    return null;
                }

                const { discountAmount } = coupon.calculateDiscount(cartTotal);
                
                return {
                    code: coupon.code,
                    description: coupon.description,
                    discountType: coupon.discountType,
                    discountAmount: coupon.discountAmount,
                    minPurchase: coupon.minPurchase,
                    validUntil: coupon.validUntil,
                    potentialDiscount: discountAmount,
                    maxUsagePerUser: coupon.maxUsagePerUser,
                    remainingUses: coupon.maxUsagePerUser - (userUsage?.usageCount || 0),
                    totalRemainingUses: coupon.totalUsageLimit - coupon.currentUsageCount
                };
            })
        );

        return validCoupons.filter(coupon => coupon !== null)
                          .sort((a, b) => b.potentialDiscount - a.potentialDiscount);
    } catch (error) {
        console.error('Error finding valid coupons:', error);
        return [];
    }
};

// Add these indexes to your coupon schema
couponSchema.index({ status: 1, validFrom: 1, validUntil: 1 });
couponSchema.index({ 'usedBy.userId': 1 });

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;