const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// Helper function to calculate discounted price
const calculateDiscountedPrice = (originalPrice, discountPercentage) => {
    const discount = (parseFloat(originalPrice) * parseFloat(discountPercentage)) / 100;
    return parseFloat(originalPrice) - discount;
};

// Get offers page with all offers
const getOffers = async (req, res) => {
    try {
        const currentTab = req.query.tab || 'product'; // Default to 'product' if no tab specified
        
        // Fetch and populate product offers, excluding those with null references
        const productOffers = await Offer.find({ 
            type: 'product',
            reference: { $ne: null } 
        }).populate({
            path: 'reference',
            select: 'productName',
            match: { _id: { $ne: null } }
        });

        // Filter out any offers where population failed
        const validProductOffers = productOffers.filter(offer => offer.reference);
        
        // Fetch and populate category offers, excluding those with null references
        const categoryOffers = await Offer.find({ 
            type: 'category',
            reference: { $ne: null } 
        }).populate({
            path: 'reference',
            select: 'name',
            match: { _id: { $ne: null } }
        });

        // Filter out any offers where population failed
        const validCategoryOffers = categoryOffers.filter(offer => offer.reference);
        
        // Fetch active products with price information
        const products = await Product.find(
            { isBlocked: false }, 
            'productName reqularPrice salePrice'
        );
        const categories = await Category.find({ status: 'Listed' }, 'name');

        // Clean up any orphaned offers (offers with null references)
        const orphanedOffers = [
            ...productOffers.filter(offer => !offer.reference),
            ...categoryOffers.filter(offer => !offer.reference)
        ];
        
        if (orphanedOffers.length > 0) {
            await Offer.deleteMany({
                _id: { $in: orphanedOffers.map(offer => offer._id) }
            });
        }

        res.render('admin/offers', {
            productOffers: validProductOffers,
            categoryOffers: validCategoryOffers,
            products,
            categories,
            currentTab
        });
    } catch (error) {
        console.error('Error in getOffers:', error);
        req.flash('error', 'Failed to load offers page');
        res.redirect('/admin/dashboard');
    }
};

// Add this new function to check for existing offers
const checkExistingOffer = async (req, res) => {
    try {
        const { type, referenceId, excludeOfferId } = req.query;
        
        const query = {
            type,
            reference: referenceId,
            status: { $in: ['active', 'pending'] }
        };

        // If excludeOfferId is provided, exclude that offer from the check
        if (excludeOfferId) {
            query._id = { $ne: excludeOfferId };
        }

        const existingOffer = await Offer.findOne(query);

        return res.json({ exists: !!existingOffer });
    } catch (error) {
        console.error('Error checking existing offer:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error checking existing offer' 
        });
    }
};

// Update the createOffer function with additional validations
const createOffer = async (req, res) => {
    try {
        const { type, referenceId, discount, validFrom, validUntil } = req.body;
        
        // Basic validation
        if (!type || !referenceId || !discount || !validFrom || !validUntil) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate discount percentage
        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 0 || discountValue > 90) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 0% and 90%'
            });
        }

        // Validate dates
        const fromDate = new Date(validFrom);
        const untilDate = new Date(validUntil);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (fromDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Valid From date cannot be in the past'
            });
        }

        if (untilDate < fromDate) {
            return res.status(400).json({
                success: false,
                message: 'Valid Until date must be current or after Valid From date'
            });
        }

        // Check for existing active offers
        const existingOffer = await Offer.findOne({
            type,
            reference: referenceId,
            status: { $in: ['active', 'pending'] }
        });

        if (existingOffer) {
            return res.status(400).json({
                success: false,
                message: `This ${type} already has an active offer`
            });
        }

        // Create new offer
        const offer = new Offer({
            type,
            discount: discountValue,
            validFrom: fromDate,
            validUntil: untilDate,
            reference: referenceId,
            referenceModel: type === 'product' ? 'Product' : 'Category',
            status: new Date() >= fromDate && new Date() <= untilDate ? 'active' : 'pending'
        });

        // Apply offer based on type
        if (type === 'product') {
            const product = await Product.findById(referenceId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found'
                });
            }

            // Calculate new price and validate
            const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
            if (discountedPrice <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Discount would result in zero or negative price'
                });
            }

            // Store the current sale price before applying the offer
            offer.previousPrice = product.salePrice;
            
            // Save the offer first
            await offer.save();

            // Update product with offer details regardless of status
            product.productOffer = discountValue;
            
            // Only update sale price if offer is active
            if (offer.status === 'active') {
                product.salePrice = discountedPrice;
            }
            
            await product.save();

        } else if (type === 'category') {
            const category = await Category.findById(referenceId);
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

            // Get all products in the category
            const products = await Product.find({ category: referenceId });
            
            // Validate that no product will have zero or negative price
            const invalidProducts = products.filter(product => {
                const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
                return discountedPrice <= 0;
            });

            if (invalidProducts.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Discount would result in zero or negative prices for ${invalidProducts.length} product(s)`
                });
            }

            // Store previous prices for all products in category
            offer.previousPrices = products.map(product => ({
                productId: product._id,
                price: product.salePrice
            }));

            // Save the offer with previous prices
            await offer.save();

            // Update category with offer percentage regardless of status
            category.offer = discountValue;
            await category.save();

            // Apply category offer to all products if offer is active
            if (offer.status === 'active') {
                for (const product of products) {
                    const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
                    
                    // Get the current product offer if any
                    const productOffer = await Offer.findOne({
                        type: 'product',
                        reference: product._id,
                        status: 'active'
                    });

                    let bestPrice = product.salePrice;

                    // Check product-specific offer
                    if (productOffer) {
                        const productDiscountedPrice = calculateDiscountedPrice(product.reqularPrice, productOffer.discount);
                        bestPrice = Math.min(bestPrice, productDiscountedPrice);
                    }

                    // Compare with category offer price
                    bestPrice = Math.min(bestPrice, discountedPrice);
                    
                    // Update the product's sale price
                    product.salePrice = bestPrice;
                    await product.save();
                }
            }
        }

        return res.status(201).json({
            success: true,
            message: 'Offer created successfully',
            offer
        });
    } catch (error) {
        console.error('Error in createOffer:', error);
        
        // If offer was created but product/category updates failed, delete the offer
        if (error.offer) {
            try {
                await Offer.findByIdAndDelete(error.offer._id);
            } catch (deleteError) {
                console.error('Error deleting failed offer:', deleteError);
            }
        }
        
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create offer'
        });
    }
};

// Update the updateOffer function with similar validations
const updateOffer = async (req, res) => {
    try {
        const { offerId } = req.params;
        const { discount, validFrom, validUntil } = req.body;

        // Find the offer first
        const offer = await Offer.findById(offerId);
        if (!offer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Offer not found' 
            });
        }

        // Validate discount percentage
        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 0 || discountValue > 90) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 0% and 90%'
            });
        }

        // Validate dates
        const fromDate = new Date(validFrom);
        const untilDate = new Date(validUntil);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (fromDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Valid From date cannot be in the past'
            });
        }

        if (untilDate < fromDate) {
            return res.status(400).json({
                success: false,
                message: 'Valid Until date must be current or after Valid From date'
            });
        }

        // Validate prices before updating
        if (offer.type === 'product') {
            const product = await Product.findById(offer.reference);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found'
                });
            }

            const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
            if (discountedPrice <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Discount would result in zero or negative price'
                });
            }

            // Update offer details
            offer.discount = discountValue;
            offer.validFrom = fromDate;
            offer.validUntil = untilDate;
            offer.status = new Date() >= fromDate && new Date() <= untilDate ? 'active' : 'pending';

            await offer.save();

            // Update product with offer details
            product.productOffer = discountValue;
            if (offer.status === 'active') {
                product.salePrice = discountedPrice;
            }
            await product.save();

        } else if (offer.type === 'category') {
            const category = await Category.findById(offer.reference);
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

            const products = await Product.find({ category: offer.reference });
            
            // Validate that no product will have zero or negative price
            const invalidProducts = products.filter(product => {
                const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
                return discountedPrice <= 0;
            });

            if (invalidProducts.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Discount would result in zero or negative prices for ${invalidProducts.length} product(s)`
                });
            }

            // Update offer details
            offer.discount = discountValue;
            offer.validFrom = fromDate;
            offer.validUntil = untilDate;
            offer.status = new Date() >= fromDate && new Date() <= untilDate ? 'active' : 'pending';

            // Store new previous prices
            offer.previousPrices = products.map(product => ({
                productId: product._id,
                price: product.salePrice
            }));

            await offer.save();

            // Update category
            category.offer = discountValue;
            await category.save();

            // Update product prices if offer is active
            if (offer.status === 'active') {
                for (const product of products) {
                    const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
                    
                    // Get the current product offer if any
                    const productOffer = await Offer.findOne({
                        type: 'product',
                        reference: product._id,
                        status: 'active'
                    });

                    let bestPrice = product.salePrice;

                    // Check product-specific offer
                    if (productOffer) {
                        const productDiscountedPrice = calculateDiscountedPrice(product.reqularPrice, productOffer.discount);
                        bestPrice = Math.min(bestPrice, productDiscountedPrice);
                    }

                    // Compare with category offer price
                    bestPrice = Math.min(bestPrice, discountedPrice);
                    
                    // Update the product's sale price
                    product.salePrice = bestPrice;
                    await product.save();
                }
            }
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Offer updated successfully' 
        });
    } catch (error) {
        console.error('Error in updateOffer:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to update offer' 
        });
    }
};

// Delete offer
const deleteOffer = async (req, res) => {
    try {
        const { offerId } = req.params;
        const offer = await Offer.findById(offerId);
        
        if (!offer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Offer not found' 
            });
        }

        if (offer.type === 'product') {
            const product = await Product.findById(offer.reference);
            if (product) {
                // Reset product offer percentage
                product.productOffer = 0;
                
                // Get all active offers for this product
                const activeOffers = await Offer.find({
                    reference: product._id,
                    type: 'product',
                    status: 'active',
                    _id: { $ne: offerId }
                });

                // Get active category offer if any
                const category = await Category.findById(product.category);
                const categoryOffer = category && category.offer ? parseFloat(category.offer) : 0;

                if (activeOffers.length > 0 || categoryOffer > 0) {
                    // Start with the previous price before this offer
                    let bestPrice = offer.previousPrice;
                    
                    // Check product-specific offers
                    activeOffers.forEach(activeOffer => {
                        const discountedPrice = calculateDiscountedPrice(product.reqularPrice, activeOffer.discount);
                        // Only use this price if it's better than our current best price
                        if (discountedPrice < bestPrice) {
                            bestPrice = discountedPrice;
                        }
                    });

                    // Check category offer
                    if (categoryOffer > 0) {
                        const categoryDiscountedPrice = calculateDiscountedPrice(product.reqularPrice, categoryOffer);
                        // Only use category price if it's better than our current best price
                        if (categoryDiscountedPrice < bestPrice) {
                            bestPrice = categoryDiscountedPrice;
                        }
                    }

                    product.salePrice = bestPrice;
                } else {
                    // No other offers exist, restore to the previous sale price
                    product.salePrice = offer.previousPrice;
                }
                
                await product.save();
            }
        } else if (offer.type === 'category') {
            const category = await Category.findById(offer.reference);
            if (category) {
                // Remove the category offer
                category.offer = '';
                await category.save();

                // Reset all products in the category
                const products = await Product.find({ category: offer.reference });
                for (const product of products) {
                    // Get all active product-specific offers
                    const activeProductOffers = await Offer.find({
                        reference: product._id,
                        type: 'product',
                        status: 'active'
                    });

                    // Find the previous price for this product
                    const previousPriceData = offer.previousPrices?.find(p => p.productId.equals(product._id));
                    const previousPrice = previousPriceData ? previousPriceData.price : product.reqularPrice;

                    if (activeProductOffers.length > 0) {
                        // Start with the previous price
                        let bestPrice = previousPrice;
                        
                        // Check each active product offer
                        activeProductOffers.forEach(productOffer => {
                            const discountedPrice = calculateDiscountedPrice(product.reqularPrice, productOffer.discount);
                            // Only use this price if it's better than our current best price
                            if (discountedPrice < bestPrice) {
                                bestPrice = discountedPrice;
                            }
                        });

                        product.salePrice = bestPrice;
                    } else {
                        // No other offers exist, restore to the previous price
                        product.salePrice = previousPrice;
                    }
                    await product.save();
                }
            }
        }

        await Offer.findByIdAndDelete(offerId);
        return res.status(200).json({ 
            success: true, 
            message: 'Offer deleted successfully' 
        });
    } catch (error) {
        console.error('Error in deleteOffer:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to delete offer' 
        });
    }
};

// Update offer statuses automatically
const updateOfferStatuses = async () => {
    const currentDate = new Date();
    
    try {
        // Find offers that need status updates
        const offers = await Offer.find({
            $or: [
                // Find pending offers that should be active
                {
                    status: 'pending',
                    validFrom: { $lte: currentDate },
                    validUntil: { $gte: currentDate }
                },
                // Find active offers that should be expired
                {
                    status: 'active',
                    validUntil: { $lt: currentDate }
                }
            ]
        });

        for (const offer of offers) {
            const oldStatus = offer.status;
            
            // Determine new status
            if (currentDate < offer.validFrom) {
                offer.status = 'pending';
            } else if (currentDate > offer.validUntil) {
                offer.status = 'expired';
            } else {
                offer.status = 'active';
            }

            // If status changed, update prices
            if (oldStatus !== offer.status) {
                await offer.save();

                if (offer.type === 'product') {
                    const product = await Product.findById(offer.reference);
                    if (product) {
                        if (offer.status === 'active') {
                            const discountedPrice = calculateDiscountedPrice(product.reqularPrice, offer.discount);
                            product.salePrice = discountedPrice;
                        } else {
                            product.salePrice = offer.previousPrice;
                        }
                        await product.save();
                    }
                } else if (offer.type === 'category') {
                    const category = await Category.findById(offer.reference);
                    if (category) {
                        const products = await Product.find({ category: offer.reference });
                        
                        for (const product of products) {
                            const previousPrice = offer.previousPrices.find(p => 
                                p.productId.toString() === product._id.toString()
                            )?.price;

                            if (offer.status === 'active') {
                                const discountedPrice = calculateDiscountedPrice(product.reqularPrice, offer.discount);
                                product.salePrice = discountedPrice;
                            } else if (previousPrice) {
                                product.salePrice = previousPrice;
                            }
                            
                            await product.save();
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in updateOfferStatuses:', error);
    }
};

// Get products for offer creation
const getProducts = async (req, res) => {
    try {
        const products = await Product.find({ isBlocked: false })
            .select('_id productName reqularPrice salePrice')
            .sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Error fetching products' });
    }
};

// Get categories for offer creation
const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ status: 'Listed' })
            .select('_id name')
            .sort({ name: 1 });
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Error fetching categories' });
    }
};

module.exports = {
    getOffers,
    createOffer,
    updateOffer,
    deleteOffer,
    updateOfferStatuses,
    getProducts,
    getCategories,
    checkExistingOffer
};





