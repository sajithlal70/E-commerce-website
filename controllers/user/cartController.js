const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { getActiveOffersForProducts } = require('./offerHelper');
const Coupon = require('../../models/couponSchema');

const addToCart = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: "Please login to manage cart"
            });
        }
        const userId = req.session.user._id;
        const { productId, quantity = 1 } = req.body;
       
        // Validate product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check stock
        if (product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Only ${product.stock} items available`
            });
        }

        // Find or create cart
        let cart = await Cart.findOne({ user: userId });
        
        if (!cart) {
            cart = new Cart({
                user: userId,
                items: [{
                    product: productId,
                    quantity: quantity
                }]
            });
        } else {
            // Check if product already exists in cart
            const existingItem = cart.items.find(item => 
                item.product.toString() === productId
            );

            if (existingItem) {
                // Check if adding more would exceed stock
                if (existingItem.quantity + quantity > product.stock) {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot add more items. Stock limit is ${product.stock}`
                    });
                }
                existingItem.quantity += quantity;
            } else {
                cart.items.push({
                    product: productId,
                    quantity: quantity
                });
            }
        }

        await cart.save();

        res.json({
            success: true,
            message: 'Product added to cart successfully'
        });

    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add item to cart'
        });
    }
};

const getCartPage = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.redirect('/signin');
        }

        const userId = req.session.user._id;
        const baseUrl = 'http://localhost:3000'; 

        // Clear any applied coupon when viewing cart
        if (req.session.appliedCoupon) {
            delete req.session.appliedCoupon;
        }

        // Fetch cart with populated product details
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                select: 'productName salePrice reqularPrice images productImage'
            });

        const categories = await Category.find();
        const cartData = cart || { items: [], totalPrice: 0 };

        // Get all products from cart items
        const cartProducts = cartData.items.map(item => item.product).filter(Boolean);
        
        // Get active offers for cart products
        const offersMap = await getActiveOffersForProducts(cartProducts);

        // Ensure we have valid items array
        if (cartData.items && Array.isArray(cartData.items)) {
            cartData.items = cartData.items.map(item => {
                if (!item || !item.product) {
                    console.log("Invalid item or missing product:", item);
                    return null;
                }

                // Get offer information for the product
                const offerInfo = offersMap.get(item.product._id.toString()) || {
                    bestOffer: 0,
                    discountedPrice: item.product.salePrice
                };

                // Handle both productImage and images arrays
                const productImages = item.product.images || [];
                const imageUrl = productImages.length > 0
                    ? `${baseUrl}/uploads/products/${productImages[0]}`
                    : '/path/to/default/image.jpg';

                return {
                    ...item.toObject(),
                    productImage: imageUrl,
                    product: {
                        ...item.product.toObject(),
                        name: item.product.productName,
                        offer: offerInfo.bestOffer,
                        originalPrice: item.product.reqularPrice,
                        discountedPrice: offerInfo.discountedPrice
                    }
                };
            }).filter(Boolean);
        }

        // Calculate totals using discounted prices
        const subtotal = cartData.items.reduce((sum, item) => {
            const price = item.product.discountedPrice || item.product.salePrice;
            return sum + (price * item.quantity);
        }, 0);

        const shippingCost = cartData.items.length > 0 ? 50 : 0;
        const total = subtotal + shippingCost;

        res.render('cart', {
            cart: cartData,
            subtotal,
            shippingCost,
            total,
            categories,
            user: req.session.user,
            offersMap,
            baseUrl 
        });
    } catch (error) {
        console.error('Cart Page Error:', error);
        res.status(500).send('Something went wrong!');
    }
};

const updateCartItem = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.session.user._id;

        // Remove any applied coupon when cart is updated
        if (req.session.appliedCoupon) {
            delete req.session.appliedCoupon;
        }

        // Input validation
        if (!productId || quantity == null) {
            return res.status(400).json({ 
                success: false,
                message: 'Product ID and quantity are required.' 
            });
        }

        // Find cart and populate product details
        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ 
                success: false,
                message: 'Cart not found.' 
            });
        }

        // Find product to get current price and check stock
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                success: false,
                message: 'Product not found.' 
            });
        }

        const newQuantity = parseInt(quantity, 10);

        // Stock validations
        if (product.quantity === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'Product is out of stock.' 
            });
        }

        if (newQuantity > 5) {
            return res.status(400).json({ 
                success: false,
                message: 'Maximum 5 units per product allowed.' 
            });
        }

        if (newQuantity > product.quantity) {
            return res.status(400).json({
                success: false,
                message: `Only ${product.quantity} units available in stock.`
            });
        }

        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId
        );

        if (itemIndex > -1) {
            // Simply update the quantity in cart without modifying admin stock
            cart.items[itemIndex].quantity = newQuantity;
        } else {
            return res.status(404).json({ 
                success: false,
                message: 'Item not found in cart.' 
            });
        }

        // Save cart
        await cart.save();

        // Fetch updated cart with populated product details
        cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            select: 'productName salePrice images'
        });

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => 
            sum + (item.product.salePrice * item.quantity), 0
        );
        const shippingCost = cart.items.length > 0 ? 50 : 0;
        const total = subtotal + shippingCost;

        return res.status(200).json({
            success: true,
            message: 'Cart updated successfully',
            cart,
            subtotal,
            total,
            shippingCost
        });
    } catch (error) {
        console.error('Update Cart Error:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Error updating cart.' 
        });
    }
};

const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.session.user._id;

        const cart = await Cart.findOne({ user: userId })
            .populate('items.product'); // Add this line to populate product details

        if (!cart) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart not found.' 
            });
        }

        cart.items = cart.items.filter(item => item.product._id.toString() !== productId);

        const subtotal = cart.items.reduce((sum, item) => {
            if (!item.product) return sum; // Add null check
            return sum + (item.product.salePrice * item.quantity);
        }, 0);

        const shippingCost = cart.items.length > 0 ? 50 : 0;
        const total = subtotal + shippingCost;

        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Item removed from cart.',
            subtotal,
            shippingCost,
            total,
            cartEmpty: cart.items.length === 0
        });
    } catch (error) {
        console.error('Remove from Cart Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error removing item from cart.' 
        });
    }
};

const getCartCount = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId });
        
        const count = cart ? cart.items.length : 0;
        
        res.status(200).json({ count });
    } catch (error) {
        console.error('Get cart count error:', error);
        res.status(500).json({ message: 'Error fetching cart count' });
    }
};

const getCartDetails = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        
        let total = 0;
        if (cart && cart.items.length > 0) {
            total = cart.items.reduce((sum, item) => {
                if (item.product) {
                    return sum + (item.product.salePrice * item.quantity);
                }
                return sum;
            }, 0);
        }
        
        res.status(200).json({ total });
    } catch (error) {
        console.error('Get cart details error:', error);
        res.status(500).json({ message: 'Error fetching cart details' });
    }
};

const updateCart = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.session.user._id;

        // Validate inputs
        if (!productId || quantity === undefined) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid request parameters'
            });
        }

        // Get current cart
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart) {
            return res.status(404).json({
                status: 'error',
                message: 'Cart not found'
            });
        }

        // Update cart item
        const cartItem = cart.items.find(item => item.product._id.toString() === productId);
        if (!cartItem) {
            return res.status(404).json({
                status: 'error',
                message: 'Product not found in cart'
            });
        }

        // Update quantity
        cartItem.quantity = quantity;
        await cart.save();

        // Remove applied coupon if exists
        if (req.session.appliedCoupon) {
            // Get the coupon details
            const coupon = await Coupon.findOne({ code: req.session.appliedCoupon.code });
            if (coupon) {
                // Recalculate cart total
                const subtotal = cart.items.reduce((total, item) => {
                    return total + (item.product.salePrice * item.quantity);
                }, 0);

                // Validate coupon with new cart total
                const validationResult = await coupon.validateForOrder(userId, subtotal);
                
                if (!validationResult.isValid) {
                    // Remove coupon if no longer valid
                    delete req.session.appliedCoupon;
                }
            } else {
                // Remove coupon if not found
                delete req.session.appliedCoupon;
            }
        }

        // Calculate new totals
        const subtotal = cart.items.reduce((total, item) => {
            return total + (item.product.salePrice * item.quantity);
        }, 0);

        const response = {
            status: 'success',
            message: 'Cart updated successfully',
            data: {
                cartItem: {
                    productId,
                    quantity,
                    total: cartItem.product.salePrice * quantity
                },
                cartTotal: subtotal,
                couponRemoved: req.session.appliedCoupon ? false : true
            }
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Cart update error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update cart'
        });
    }
};

const clearCart = async (req, res) => {
    try {
        const userId = req.session.user._id;
        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [] } }
        );
        
        res.json({
            success: true,
            message: 'Cart cleared successfully'
        });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear cart'
        });
    }
};

module.exports = {
    addToCart,
    getCartPage,
    updateCartItem,
    removeFromCart,
    getCartCount,
    getCartDetails,
    updateCart,
    clearCart
};
