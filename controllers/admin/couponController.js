const Coupon = require('../../models/couponSchema');

const getCouponPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const totalCoupons = await Coupon.countDocuments();
        const coupons = await Coupon.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('coupon', {
            coupons: coupons,
            currentPage: page,
            totalPages: Math.ceil(totalCoupons / limit),
            totalCoupons: totalCoupons
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            title: 'Error Loading Page',
            message: 'Failed to load coupon management page'
        });
    }
};

const createCoupon = async (req, res) => {
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

        // Basic validation
        if (!code || !description || !discountAmount || !minPurchase || !validFrom || !validUntil || !totalUsageLimit) {
            return res.status(400).json({
                status: 'error',
                title: 'Missing Information',
                message: 'Please fill in all required fields'
            });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                status: 'error',
                title: 'Invalid Code',
                message: 'This coupon code already exists'
            });
        }

        // Validate discount amount
        if (discountType === 'percentage' && (discountAmount <= 0 || discountAmount > 90)) {
            return res.status(400).json({
                status: 'error',
                title: 'Invalid Discount',
                message: 'Percentage discount must be between 0 and 90'
            });
        }

        // Validate dates
        const validFromDate = new Date(validFrom);
        const validUntilDate = new Date(validUntil);
        const currentDate = new Date();

        if (validFromDate > validUntilDate) {
            return res.status(400).json({
                status: 'error',
                title: 'Invalid Dates',
                message: 'Valid from date must be before valid until date'
            });
        }

        // Determine coupon status
        let status = 'active';
        if (validUntilDate < currentDate) {
            status = 'expired';
        } else if (currentDate < validFromDate) {
            status = 'active'; // Future coupon
        }

        // Create new coupon
        const newCoupon = new Coupon({
            code: code.toUpperCase(),
            description,
            discountType,
            discountAmount: Number(discountAmount),
            minPurchase: Number(minPurchase),
            validFrom: validFromDate,
            validUntil: validUntilDate,
            maxUsagePerUser: Number(maxUsagePerUser) || 1,
            totalUsageLimit: Number(totalUsageLimit),
            currentUsageCount: 0,
            status: status,
            usedBy: []
        });

        await newCoupon.save();

        res.status(201).json({
            status: 'success',
            title: 'Success',
            message: 'Coupon created successfully',
            data: newCoupon
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            title: 'Creation Failed',
            message: error.message || 'Unable to create coupon. Please try again.'
        });
    }
};

const validateCoupon = async (req, res) => {
    try {
        const { code, userId, cartTotal } = req.body;

        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        
        if (!coupon) {
            return res.status(404).json({
                status: 'error',
                message: 'Invalid coupon code. Please enter a valid coupon.'
            });
        }

        const validationResult = await coupon.isValidForUser(userId, cartTotal);
        
        if (!validationResult.isValid) {
            return res.status(400).json({
                status: 'error',
                message: validationResult.message
            });
        }

        const discountResult = coupon.calculateDiscount(cartTotal);

        res.status(200).json({
            status: 'success',
            message: 'Coupon applied successfully!',
            data: {
                discountAmount: discountResult.discountAmount,
                finalPrice: discountResult.finalPrice,
                couponDetails: {
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountAmount: coupon.discountAmount
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to validate coupon. Please try again.'
        });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { code, userId, cartTotal } = req.body;

        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        
        if (!coupon) {
            return res.status(404).json({
                status: 'error',
                message: 'Invalid coupon code. Please enter a valid coupon.'
            });
        }

        const validationResult = await coupon.isValidForUser(userId, cartTotal);
        
        if (!validationResult.isValid) {
            return res.status(400).json({
                status: 'error',
                message: validationResult.message
            });
        }

        const discountResult = coupon.calculateDiscount(cartTotal);

        // Update coupon usage
        const userUsageIndex = coupon.usedBy.findIndex(
            usage => usage.userId.toString() === userId.toString()
        );

        if (userUsageIndex === -1) {
            coupon.usedBy.push({ userId });
        } else {
            coupon.usedBy[userUsageIndex].usageCount += 1;
            coupon.usedBy[userUsageIndex].lastUsedAt = new Date();
        }

        coupon.currentUsageCount += 1;
        await coupon.save();

        res.status(200).json({
            status: 'success',
            message: 'Coupon applied successfully!',
            data: {
                discountAmount: discountResult.discountAmount,
                finalPrice: discountResult.finalPrice,
                couponDetails: {
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountAmount: coupon.discountAmount
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to apply coupon. Please try again.'
        });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCoupon = await Coupon.findByIdAndDelete(id);

        if (!deletedCoupon) {
            return res.status(404).json({
                status: 'error',
                title: 'Not Found',
                message: 'Coupon not found or already deleted'
            });
        }

        res.status(200).json({
            status: 'success',
            title: 'Success',
            message: 'Coupon has been successfully deleted'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            title: 'Deletion Failed',
            message: 'Unable to delete coupon. Please try again.'
        });
    }
};

const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
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

        // Find existing coupon
        const existingCoupon = await Coupon.findById(id);
        if (!existingCoupon) {
            return res.status(404).json({
                status: 'error',
                title: 'Not Found',
                message: 'Coupon not found'
            });
        }

        // Check if code is being changed and if new code already exists
        if (code.toUpperCase() !== existingCoupon.code) {
            const codeExists = await Coupon.findOne({ code: code.toUpperCase() });
            if (codeExists) {
                return res.status(400).json({
                    status: 'error',
                    title: 'Invalid Code',
                    message: 'This coupon code already exists'
                });
            }
        }

        // Validate discount amount
        if (discountType === 'percentage' && (discountAmount <= 0 || discountAmount > 90)) {
            return res.status(400).json({
                status: 'error',
                title: 'Invalid Discount',
                message: 'Percentage discount must be between 0 and 90'
            });
        }

        // Validate dates
        const validFromDate = new Date(validFrom);
        const validUntilDate = new Date(validUntil);
        const currentDate = new Date();

        if (validFromDate > validUntilDate) {
            return res.status(400).json({
                status: 'error',
                title: 'Invalid Dates',
                message: 'Valid from date must be before valid until date'
            });
        }

        // Determine coupon status
        let status = 'active';
        if (validUntilDate < currentDate) {
            status = 'expired';
        } else if (currentDate < validFromDate) {
            status = 'active'; // Future coupon
        }

        // Check if usage limit is reached
        if (existingCoupon.currentUsageCount >= totalUsageLimit) {
            status = 'disabled';
        }

        // Update coupon
        const updatedCoupon = await Coupon.findByIdAndUpdate(
            id,
            {
                code: code.toUpperCase(),
                description,
                discountType,
                discountAmount: Number(discountAmount),
                minPurchase: Number(minPurchase),
                validFrom: validFromDate,
                validUntil: validUntilDate,
                maxUsagePerUser: Number(maxUsagePerUser) || 1,
                totalUsageLimit: Number(totalUsageLimit),
                status: status
            },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            status: 'success',
            title: 'Success',
            message: 'Coupon updated successfully',
            data: updatedCoupon
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            title: 'Update Failed',
            message: error.message || 'Unable to update coupon. Please try again.'
        });
    }
};

const getCouponById = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        
        if (!coupon) {
            return res.status(404).json({
                status: 'error',
                title: 'Not Found',
                message: 'Coupon not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: coupon
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            title: 'Error',
            message: 'Failed to fetch coupon details'
        });
    }
};

module.exports = {
    getCouponPage,
    createCoupon,
    validateCoupon,
    applyCoupon,
    deleteCoupon,
    editCoupon,
    getCouponById
};  