const Cart = require('../models/cartSchema');
const Coupon = require('../models/couponSchema');

const validateAppliedCoupon = async (req, res, next) => {
    try {
        if (!req.session.appliedCoupon) {
            return next();
        }

        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        
        if (!cart || !cart.items.length) {
            delete req.session.appliedCoupon;
            req.flash('warning', 'Your cart is empty. Any applied coupons have been removed.');
            return next();
        }

        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        const coupon = await Coupon.findOne({
            code: req.session.appliedCoupon.code,
            status: 'active',
            validFrom: { $lte: new Date() },
            validUntil: { $gt: new Date() },
            minPurchase: { $lte: subtotal }
        });
        
        if (!coupon) {
            delete req.session.appliedCoupon;
            req.flash('warning', 'The applied coupon is no longer valid for your order.');
            return next();
        }

        // Check usage limits
        const userUsage = coupon.usedBy.find(usage => 
            usage.userId.toString() === userId.toString()
        );

        if (userUsage && userUsage.usageCount >= coupon.maxUsagePerUser) {
            delete req.session.appliedCoupon;
            req.flash('warning', 'You have reached the maximum usage limit for this coupon.');
            return next();
        }

        if (coupon.currentUsageCount >= coupon.totalUsageLimit) {
            delete req.session.appliedCoupon;
            req.flash('warning', 'This coupon has reached its total usage limit.');
            return next();
        }

        // Validate coupon for current cart
        const validationResult = await coupon.validateForOrder(userId, subtotal);
        
        if (!validationResult.isValid) {
            delete req.session.appliedCoupon;
            req.flash('warning', validationResult.message);
            return next();
        }

        // Update the session with current discount calculation
        const { discountAmount } = coupon.calculateDiscount(subtotal);
        req.session.appliedCoupon = {
            ...req.session.appliedCoupon,
            actualDiscount: discountAmount
        };

        next();
    } catch (error) {
        console.error('Coupon validation error:', error);
        delete req.session.appliedCoupon;
        req.flash('error', 'An error occurred while validating the coupon.');
        next();
    }
};

const validateCouponData = async (req, res, next) => {
    try {
        const {
            code,
            description,
            discountType,
            discountAmount,
            minPurchase,
            validFrom,
            validUntil,
            maxUsagePerUser,
            totalUsageLimit
        } = req.body;

        const errors = {};

        // Validate code
        if (!code || code.trim().length < 3) {
            errors.code = 'Coupon code must be at least 3 characters long';
        } else {
            // Check if code already exists (except for updates)
            const existingCoupon = await Coupon.findOne({ 
                code: code.toUpperCase(),
                _id: { $ne: req.params.id } // Exclude current coupon in case of update
            });
            if (existingCoupon) {
                errors.code = 'Coupon code already exists';
            }
        }

        // Validate description
        if (!description || description.trim().length < 10) {
            errors.description = 'Description must be at least 10 characters long';
        }

        // Validate discount type
        if (!['percentage', 'fixed'].includes(discountType)) {
            errors.discountType = 'Invalid discount type';
        }

        // Validate discount amount
        if (discountType === 'percentage') {
            if (discountAmount <= 0 || discountAmount > 90) {
                errors.discountAmount = 'Percentage discount must be between 1 and 90';
            }
        } else {
            if (discountAmount <= 0) {
                errors.discountAmount = 'Fixed discount amount must be greater than 0';
            }
        }

        // Validate minimum purchase
        if (minPurchase < 0) {
            errors.minPurchase = 'Minimum purchase amount cannot be negative';
        }

        // Validate dates
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        
        const fromDate = new Date(validFrom);
        const untilDate = new Date(validUntil);

        if (isNaN(fromDate.getTime())) {
            errors.validFrom = 'Invalid start date';
        } else if (fromDate < currentDate) {
            errors.validFrom = 'Start date cannot be in the past';
        }

        if (isNaN(untilDate.getTime())) {
            errors.validUntil = 'Invalid end date';
        } else if (untilDate <= fromDate) {
            errors.validUntil = 'End date must be after start date';
        }

        // Validate usage limits
        if (!maxUsagePerUser || maxUsagePerUser < 1) {
            errors.maxUsagePerUser = 'Maximum usage per user must be at least 1';
        }

        if (!totalUsageLimit || totalUsageLimit < 1) {
            errors.totalUsageLimit = 'Total usage limit must be at least 1';
        } else if (totalUsageLimit < maxUsagePerUser) {
            errors.totalUsageLimit = 'Total usage limit cannot be less than max usage per user';
        }

        // If there are validation errors, return them
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                status: 'error',
                errors
            });
        }

        // If validation passes, add normalized data to request
        req.validatedCouponData = {
            code: code.toUpperCase(),
            description: description.trim(),
            discountType,
            discountAmount: Number(discountAmount),
            minPurchase: Number(minPurchase),
            validFrom: fromDate,
            validUntil: untilDate,
            maxUsagePerUser: Number(maxUsagePerUser),
            totalUsageLimit: Number(totalUsageLimit)
        };

        next();
    } catch (error) {
        console.error('Coupon validation error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error during validation'
        });
    }
};

module.exports = {
    validateAppliedCoupon,
    validateCouponData
}; 