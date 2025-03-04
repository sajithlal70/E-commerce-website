const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Category = require("../../models/categorySchema");
const Order = require('../../models/orderSchema');
const Coupon  = require('../../models/couponSchema');
const Address = require('../../models/addressSchema');
const Wallet = require('../../models/walletSchema');
const Transaction = require('../../models/transactionSchema');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { updateProductStock } = require('../../helpers/productStockUpdate');

const generateTransactionReference = () => {
    return 'TXN' + Date.now().toString() + crypto.randomBytes(4).toString('hex');
};

const getCheckoutPage = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/signin');
        }

        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        const wallet = await Wallet.findOne({ userId });
        const addresses = await Address.findOne({ userId });
        const categories = await Category.find({ status: 'Listed' });

        if (!cart || !cart.items.length) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }

        // Calculate subtotal
        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        // Get applied coupon from session
        const appliedCoupon = req.session.appliedCoupon;
        let discount = 0;

        if (appliedCoupon) {
            // Use fixed discount amount
            discount = Math.min(appliedCoupon.discountAmount, subtotal);
        }

        // Calculate amount after discount
        const amountAfterDiscount = subtotal - discount;
        
        // Add shipping charge after discount
        const shipping = 50;
        const total = amountAfterDiscount + shipping;

        res.render('user/checkout', {
            cart,
            addresses: addresses?.address || [],
            defaultAddress: addresses?.address.find(addr => addr.isDefault) || addresses?.address[0],
            wallet: wallet || { balance: 0 },
            subtotal,
            discount,
            amountAfterDiscount,
            shipping,
            total,
            user: req.session.user,
            categories,
            appliedCoupon
        });

    } catch (error) {
        console.error('Error in getCheckoutPage:', error);
        req.flash('error', 'Error loading checkout page');
        res.redirect('/cart');
    }
};

const processWalletPayment = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, amount, couponCode } = req.body;

        // Get and validate cart
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || !cart.items.length) {
            throw new Error('Cart is empty');
        }

        // Validate products and stock
        for (const item of cart.items) {
            const product = await Product.findById(item.product._id);
            if (!product || product.quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${item.product.productName}`);
            }
        }

        // Get and validate wallet
        const wallet = await Wallet.findOne({ userId });
        if (!wallet || wallet.balance < amount) {
            throw new Error('Insufficient wallet balance');
        }

        // Get and validate address
        const addressDoc = await Address.findOne({ 
            userId,
            'address._id': addressId 
        });
        
        if (!addressDoc) {
            throw new Error('Address not found');
        }

        const selectedAddress = addressDoc.address.find(addr => 
            addr._id.toString() === addressId
        );
        if (!selectedAddress) {
            throw new Error('Selected address not found');
        }

        const shippingAddress = {
            name: selectedAddress.name,
            phone: selectedAddress.phone,
            street: selectedAddress.street,
            city: selectedAddress.city,
            postalCode: selectedAddress.postalCode,
            landMark: selectedAddress.landMark,
            addressType: selectedAddress.addressType
        };

        // Calculate new balance
        const newBalance = wallet.balance - amount;

        // Create transaction record
        const transaction = await Transaction.create({
            walletId: wallet._id,
            userId,
            type: 'debit',
            amount,
            description: 'Order payment',
            reference: generateTransactionReference(),
            status: 'completed',
            paymentMethod: 'wallet',
            transactionType: 'purchase',
            balance: newBalance,
        });

        // Update wallet balance
        wallet.balance = newBalance;
        await wallet.save();

        // Calculate subtotal
        const subtotal = cart.items.reduce((sum, item) => 
            sum + (item.product.salePrice * item.quantity), 0
        );
        
        const shippingCost = 50;
        
        let discountAmount = 0;
        if (couponCode && req.session.appliedCoupon) {
            if (typeof req.session.appliedCoupon.discountAmount === 'number') {
                discountAmount = req.session.appliedCoupon.discountAmount;
            } else if (typeof req.session.appliedCoupon.discountPercentage === 'number') {
                discountAmount = subtotal * (req.session.appliedCoupon.discountPercentage / 100);
            }
            if (isNaN(discountAmount)) {
                discountAmount = 0;
            }
        }

        // Create order
        const order = await Order.create({
            user: userId,
            items: cart.items.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.product.salePrice
            })),
            shippingAddress,
            paymentMethod: 'wallet',
            subtotal,
            shippingCost,
            discountAmount, 
            total: amount,
            orderStatus: 'Processing',
            paymentStatus: 'Paid',
            couponCode: couponCode || null,
            paymentDetails: {
                transactionId: transaction._id,
                paidAt: new Date()
            }
        });


        await updateProductStock(order.items, false); 


        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [] } }
        );

        // Clear applied coupon
        if (req.session.appliedCoupon) {
            delete req.session.appliedCoupon;
        }

        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: order._id
        });

    } catch (error) {
        console.error('Wallet payment error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Payment processing failed'
        });
    }
};


const validateCoupon = async (couponCode, userId, subtotal) => {
    const coupon = await Coupon.findOne({ code: couponCode });

    if (!coupon) {
        return { valid: false, message: 'Invalid coupon code' };
    }

    // Use the built-in method from your schema to validate
    const validationResult = await coupon.isValidForUser(userId, subtotal);
    
    if (!validationResult.isValid) {
        return { valid: false, message: validationResult.message };
    }

    return { valid: true, coupon };
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user._id;

        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || !cart.items.length) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        const subtotal = cart.items.reduce((acc, item) => {
            return acc + item.product.salePrice * item.quantity;
        }, 0);

        const coupon = await Coupon.findOne({ code: couponCode });
        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon code'
            });
        }

        // Use the validateForOrder method that includes discount calculation
        const validation = await coupon.validateForOrder(userId, subtotal);
        
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        // Store applied coupon in session
        req.session.appliedCoupon = {
            code: validation.code,
            discount: validation.discountAmount,
            discountType: validation.discountType
        };
        
        
        return res.status(200).json({
            success: true,
            message: 'Coupon applied successfully!',
            discount: validation.discountAmount,
            // Assuming shipping cost is 50
            total: validation.finalPrice + 50
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Error applying coupon'
        });
    }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        
        if (!cart) {
            return res.status(400).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Calculate the original total without any discounts
        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        const shipping = 50;

        // Clear any applied coupon from the session
        delete req.session.appliedCoupon;
        await req.session.save();

        res.status(200).json({
            success: true,
            message: 'Coupon removed successfully',
            subtotal: subtotal,
            shipping: shipping,
            total: subtotal + shipping,
            appliedCoupon: null
        });

    } catch (error) {
        console.error('Remove coupon error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove coupon'
        });
    }
};

const addNewAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const {
            name,
            phone,
            street,
            city,
            postalCode,
            landmark,
            addressType,
            isDefault
        } = req.body;

        // Find existing address document for user
        let userAddress = await Address.findOne({ userId });

        const newAddress = {
            name,
            phone,
            street,
            city,
            postalCode,
            landMark: landmark,
            addressType,
            isDefault: isDefault === 'on' // Convert checkbox value to boolean
        };

        if (!userAddress) {
            // If no addresses exist, create new document and set address as default
            userAddress = new Address({
                userId,
                address: [{ ...newAddress, isDefault: true }] // First address is always default
            });
        } else {
            // If this is being set as default, unset existing default
            if (newAddress.isDefault) {
                userAddress.address.forEach(addr => {
                    addr.isDefault = false;
                });
            }
            // If this is the first address, make it default regardless
            else if (userAddress.address.length === 0) {
                newAddress.isDefault = true;
            }
            // If no address is marked as default, make this one default
            else if (!userAddress.address.some(addr => addr.isDefault)) {
                newAddress.isDefault = true;
            }
            
            userAddress.address.push(newAddress);
        }

        await userAddress.save();

        req.flash('success', 'Address added successfully');
        res.redirect('/checkout');

    } catch (error) {
        console.error('Add Address Error:', error);
        req.flash('error', error.message || 'Error adding address');
        res.redirect('/checkout/address/add');
    }
};

const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.params.id;

        console.log('Setting default address:', { userId, addressId });

        // Find the user's address document
        const userAddress = await Address.findOne({ userId });
        
        console.log('Found user address document:', userAddress);

        if (!userAddress) {
            return res.status(404).json({
                success: false,
                message: 'No addresses found'
            });
        }

        // Find the specific address in the array
        const addressToUpdate = userAddress.address.id(addressId);
        console.log('Found address to update:', addressToUpdate);

        if (!addressToUpdate) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Set all addresses to non-default
        userAddress.address.forEach(addr => {
            addr.isDefault = false;
        });

        // Set the selected address as default
        addressToUpdate.isDefault = true;

        console.log('Updated address document before save:', userAddress);

        // Save the changes
        await userAddress.save();

        console.log('Successfully saved address document');

        return res.status(200).json({
            success: true,
            message: 'Default address updated successfully'
        });

    } catch (error) {
        console.error('Set default address error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to update default address'
        });
    }
};

// Add this function to edit an address
const editAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.params.id;
        const {
            name,
            phone,
            street,
            city,
            postalCode,
            landmark,
            addressType,
            isDefault
        } = req.body;

        const userAddress = await Address.findOne({ userId });
        
        if (!userAddress) {
            throw new Error('No addresses found');
        }

        const addressToUpdate = userAddress.address.id(addressId);
        if (!addressToUpdate) {
            throw new Error('Address not found');
        }

        // If this address is being set as default, unset other defaults
        if (isDefault === 'on' && !addressToUpdate.isDefault) {
            userAddress.address.forEach(addr => {
                addr.isDefault = false;
            });
            addressToUpdate.isDefault = true;
        }
        // If this was default and default is being unset, make sure at least one address is default
        else if (addressToUpdate.isDefault && isDefault !== 'on') {
            // If this is the only address, force it to remain default
            if (userAddress.address.length === 1) {
                addressToUpdate.isDefault = true;
            } else {
                // Make the first other address default
                const otherAddress = userAddress.address.find(addr => addr._id.toString() !== addressId);
                if (otherAddress) {
                    otherAddress.isDefault = true;
                }
                addressToUpdate.isDefault = false;
            }
        }

        // Update address fields
        addressToUpdate.name = name;
        addressToUpdate.phone = phone;
        addressToUpdate.street = street;
        addressToUpdate.city = city;
        addressToUpdate.postalCode = postalCode;
        addressToUpdate.landMark = landmark;
        addressToUpdate.addressType = addressType;

        await userAddress.save();

        req.flash('success', 'Address updated successfully');
        res.redirect('/checkout');

    } catch (error) {
        console.error('Edit address error:', error);
        req.flash('error', error.message || 'Failed to update address');
        res.redirect('/checkout/addresses');
    }
};

// COD Payment Handler
const handleCodPayment = async (req, res) => {
    try {
        const {
            addressId,
            amount,
            subtotal,
            shipping,
            discount,
            paymentMethod,
            couponCode,
            items
        } = req.body;

        // Validate the order data
        if (!addressId || !amount || !items) {
            return res.status(400).json({
                success: false,
                message: 'Missing required order information'
            });
        }

        // Get and validate address
        const addressDoc = await Address.findOne({ 
            userId: req.session.user._id,
            'address._id': addressId 
        });
        
        if (!addressDoc) {
            return res.status(400).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Find the specific address from the addresses array
        const selectedAddress = addressDoc.address.find(addr => 
            addr._id.toString() === addressId
        );

        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Selected address not found'
            });
        }

        // Format shipping address for order
        const shippingAddress = {
            name: selectedAddress.name,
            phone: selectedAddress.phone,
            street: selectedAddress.street,
            city: selectedAddress.city,
            postalCode: selectedAddress.postalCode,
            landMark: selectedAddress.landMark,
            addressType: selectedAddress.addressType
        };

        // Create new order with correct field names and values
        const order = await Order.create({
            user: req.session.user._id,
            items: items.map(item => ({
                product: item.product,
                quantity: item.quantity,
                price: item.price
            })),
            shippingAddress: shippingAddress, // Use the formatted shipping address
            total: amount,
            subtotal: subtotal,
            shippingCost: shipping,
            discount: discount || 0,
            paymentMethod: 'cod',
            paymentStatus: 'Pending',
            orderStatus: 'Processing',
            couponUsed: couponCode || null,
            paymentDetails: {
                paidAt: null, // Will be updated when payment is received
                paymentMethod: 'cod'
            }
        });

        // Update product stock
        for (const item of items) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: -item.quantity } },
                { new: true }
            );

            // Validate stock update was successful
            const updatedProduct = await Product.findById(item.product);
            if (updatedProduct.stock < 0) {
                // Rollback the order if stock becomes negative
                await Order.findByIdAndDelete(order._id);
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for product: ${updatedProduct.name}`
                });
            }
        }

        // If coupon was used, update coupon usage
        if (couponCode) {
            await Coupon.findOneAndUpdate(
                { code: couponCode },
                { 
                    $inc: { usageCount: 1 },
                    $push: { 
                        usedBy: {
                            userId: req.session.user._id,
                            orderId: order._id,
                            usedAt: new Date()
                        }
                    }
                }
            );
        }

        // Clear the user's cart
        await Cart.findOneAndUpdate(
            { user: req.session.user._id },
            { $set: { items: [] } }
        );

        // Clear any applied coupon from session
        if (req.session.appliedCoupon) {
            delete req.session.appliedCoupon;
        }

        return res.status(200).json({
            success: true,
            orderId: order._id,
            message: 'Order placed successfully'
        });

    } catch (error) {
        console.error('COD payment error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to process COD order'
        });
    }
};

// Add this new function to get cart items
const getCartItems = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                select: '_id productName salePrice'
            });

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Format cart items for order creation
        const formattedItems = cart.items.map(item => ({
            product: item.product._id,
            quantity: item.quantity,
            price: item.product.salePrice,
            name: item.product.productName // Include product name for reference
        }));

        res.json({
            success: true,
            items: formattedItems
        });

    } catch (error) {
        console.error('Get cart items error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get cart items'
        });
    }
};

// Add this new controller method to get order summary
const getOrderSummary = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');

        if (!cart) {
            return res.status(400).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Calculate subtotal first
        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        let discount = 0;
        let discountDetails = null;

        // Calculate discount if coupon is applied
        if (req.session.appliedCoupon) {
            const coupon = req.session.appliedCoupon;
            discount = Math.min(coupon.discountAmount, subtotal);
            discountDetails = {
                code: coupon.code,
                discountAmount: parseFloat(discount.toFixed(2))
            };
        }

        const shipping = 50;
        const total = subtotal - discount + shipping;

        res.json({
            success: true,
            subtotal: parseFloat(subtotal.toFixed(2)),
            discount: parseFloat(discount.toFixed(2)),
            shipping: shipping,
            total: parseFloat(total.toFixed(2)),
            appliedCoupon: discountDetails
        });

    } catch (error) {
        console.error('Get order summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get order summary'
        });
    }
};

module.exports = {
    getCheckoutPage,
    addNewAddress,
    applyCoupon,
    removeCoupon,
    processWalletPayment,
    handleCodPayment,
    getCartItems,
    getOrderSummary,
    setDefaultAddress,
    editAddress
}; 