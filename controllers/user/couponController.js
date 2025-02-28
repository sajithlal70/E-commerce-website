const Coupon = require('../../models/couponSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');

const validateCoupon = async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({
                status: 'error',
                message: 'Please enter a coupon code'
            });
        }

        const userId = req.session.user._id;
        if (!userId) {
            return res.status(401).json({
                status: 'error',
                message: 'Please login to apply coupons'
            });
        }

        // Find cart and calculate actual total
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Your cart is empty'
            });
        }

        // Calculate actual cart total
        const subtotal = cart.items.reduce((total, item) => {
            if (!item.product || !item.product.salePrice) {
                throw new Error('Invalid product in cart');
            }
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        const coupon = await Coupon.findOne({ 
            code: code.toUpperCase(),
            status: 'active',
            validFrom: { $lte: new Date() },
            validUntil: { $gt: new Date() }
        });
        
        if (!coupon) {
            return res.status(404).json({
                status: 'error',
                message: 'Invalid coupon code or coupon has expired'
            });
        }

        // Check if coupon is already applied
        if (req.session.appliedCoupon && req.session.appliedCoupon.code === coupon.code) {
            return res.status(400).json({
                status: 'error',
                message: 'This coupon is already applied to your order'
            });
        }

        // Validate coupon for this order
        const validationResult = await coupon.validateForOrder(userId, subtotal);
        if (!validationResult.isValid) {
            return res.status(400).json({
                status: 'error',
                message: validationResult.message
            });
        }

        // Calculate discount
        const { discountAmount, finalPrice } = coupon.calculateDiscount(subtotal);

        res.status(200).json({
            status: 'success',
            message: `Coupon ${coupon.code} applied successfully! You saved ₹${discountAmount.toFixed(2)}`,
            data: {
                discountAmount,
                finalPrice,
                subtotal,
                shippingCost: 50,
                total: finalPrice + 50,
                couponDetails: {
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountAmount: coupon.discountAmount
                }
            }
        });
    } catch (error) {
        console.error('Coupon validation error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to validate coupon. Please try again.'
        });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.session.user._id;

        // Find cart and calculate total
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || !cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        const cartTotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        // Find and validate coupon
        const coupon = await Coupon.findOne({ 
            code: code.toUpperCase(),
            status: 'active',
            validFrom: { $lte: new Date() },
            validUntil: { $gt: new Date() },
            minPurchase: { $lte: cartTotal }
        });
        
        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon code or minimum purchase requirement not met'
            });
        }

        // Check if coupon has reached total usage limit
        if (coupon.currentUsageCount >= coupon.totalUsageLimit) {
            return res.status(400).json({
                success: false,
                message: 'This coupon has reached its usage limit'
            });
        }

        // Check user's usage of this coupon
        const userUsage = coupon.usedBy.find(usage => 
            usage.userId.toString() === userId.toString()
        );

        if (userUsage && userUsage.usageCount >= coupon.maxUsagePerUser) {
            return res.status(400).json({
                success: false,
                message: 'You have already used this coupon the maximum number of times'
            });
        }

        // Calculate discount
        let discountAmount;
        if (coupon.discountType === 'percentage') {
            discountAmount = (cartTotal * coupon.discountAmount) / 100;
        } else {
            discountAmount = coupon.discountAmount;
        }

        // Store coupon in session
        req.session.appliedCoupon = {
            code: coupon.code,
            discountAmount: discountAmount,
            discountType: coupon.discountType
        };

        res.json({
            success: true,
            message: 'Coupon applied successfully!',
            discountAmount: discountAmount,
            finalAmount: cartTotal - discountAmount
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply coupon'
        });
    }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user._id;
        if (!userId) {
            return res.status(401).json({
                status: 'error',
                message: 'Please login to manage coupons'
            });
        }
        
        if (!req.session.appliedCoupon) {
            return res.status(400).json({
                status: 'error',
                message: 'No coupon is currently applied to your order'
            });
        }

        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart) {
            return res.status(400).json({
                status: 'error',
                message: 'Cart not found'
            });
        }

        const subtotal = cart.items.reduce((total, item) => {
            if (!item.product || !item.product.salePrice) {
                throw new Error('Invalid product in cart');
            }
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        const removedCouponCode = req.session.appliedCoupon.code;
        delete req.session.appliedCoupon;

        const total = subtotal + 50; // Adding shipping cost

        res.status(200).json({
            status: 'success',
            message: `Coupon ${removedCouponCode} has been removed from your order`,
            data: {
                subtotal,
                shippingCost: 50,
                total,
                discountAmount: 0
            }
        });
    } catch (error) {
        console.error('Remove coupon error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to remove coupon. Please try again.'
        });
    }
};

const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const currentDate = new Date();

        // Get cart total
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        const cartTotal = cart?.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0) || 0;

        // Convert userId to ObjectId for comparison
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Get only active and unused coupons
        const coupons = await Coupon.aggregate([
            {
                $match: {
            status: 'active',
            validFrom: { $lte: currentDate },
                    validUntil: { $gt: currentDate }
                }
            },
            {
                $addFields: {
                    userUsage: {
                        $filter: {
                            input: '$usedBy',
                            as: 'usage',
                            cond: { $eq: ['$$usage.userId', userObjectId] }
                        }
                    }
                }
            },
            {
                $match: {
                    $expr: {
                        $and: [
                            // Check total usage limit
                            { $lt: [{ $ifNull: ['$currentUsageCount', 0] }, '$totalUsageLimit'] },
                            // Check if user has not used the coupon or hasn't reached their limit
                            {
                                $or: [
                                    { $eq: [{ $size: '$userUsage' }, 0] },
                                    {
                                        $lt: [
                                            { $arrayElemAt: ['$userUsage.usageCount', 0] },
                                            '$maxUsagePerUser'
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $project: {
                    code: 1,
                    description: 1,
                    discountType: 1,
                    discountAmount: 1,
                    minPurchase: 1,
                    validUntil: 1,
                    maxUsagePerUser: 1,
                    totalUsageLimit: 1,
                    currentUsageCount: { $ifNull: ['$currentUsageCount', 0] },
                    userUsageCount: {
                        $ifNull: [
                            { $arrayElemAt: ['$userUsage.usageCount', 0] },
                            0
                        ]
                    }
                }
            }
        ]);

        console.log('Raw coupons from DB:', coupons);

        // Format coupons with validation status
        const formattedCoupons = coupons.map(coupon => {
            const meetsMinPurchase = cartTotal >= coupon.minPurchase;
            
            let validationMessage = '';
            if (!meetsMinPurchase) {
                const amountNeeded = coupon.minPurchase - cartTotal;
                validationMessage = `Add ₹${amountNeeded.toFixed(2)} more to your cart to use this coupon`;
            }

            const remainingUserUses = coupon.maxUsagePerUser - (coupon.userUsageCount || 0);
            const remainingTotalUses = coupon.totalUsageLimit - (coupon.currentUsageCount || 0);

                return {
                    code: coupon.code,
                    description: coupon.description,
                    discountType: coupon.discountType,
                    discountAmount: coupon.discountAmount,
                    minPurchase: coupon.minPurchase,
                expiryDate: coupon.validUntil,
                    maxUsagePerUser: coupon.maxUsagePerUser,
                    totalUsageLimit: coupon.totalUsageLimit,
                currentUsageCount: coupon.currentUsageCount,
                remainingUses: remainingTotalUses,
                userRemainingUses: remainingUserUses,
                isValid: true,
                canApply: meetsMinPurchase,
                validationMessage,
                isNew: coupon.userUsageCount === 0
            };
        });

        // Sort coupons: unused first, then by discount value
        formattedCoupons.sort((a, b) => {
            // First sort by whether the coupon is new (unused)
            if (a.isNew !== b.isNew) {
                return a.isNew ? -1 : 1;
            }
            // Then sort by discount type and amount
            if (a.discountType === b.discountType) {
                return b.discountAmount - a.discountAmount;
            }
            return a.discountType === 'percentage' ? -1 : 1;
        });

        console.log('Formatted coupons:', formattedCoupons);
        res.json(formattedCoupons);

    } catch (error) {
        console.error('Error fetching available coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available coupons'
        });
    }
};

module.exports = {
    validateCoupon,
    applyCoupon,
    removeCoupon,
    getAvailableCoupons
}; 