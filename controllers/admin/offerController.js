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
        const currentTab = req.query.tab || 'product';
        
        const productOffers = await Offer.find({ 
            type: 'product',
            reference: { $ne: null } 
        }).populate({
            path: 'reference',
            select: 'productName',
            match: { _id: { $ne: null } }
        });

        const validProductOffers = productOffers.filter(offer => offer.reference);
        
        const categoryOffers = await Offer.find({ 
            type: 'category',
            reference: { $ne: null } 
        }).populate({
            path: 'reference',
            select: 'name',
            match: { _id: { $ne: null } }
        });

        const validCategoryOffers = categoryOffers.filter(offer => offer.reference);
        
        const products = await Product.find(
            { isBlocked: false }, 
            'productName reqularPrice salePrice'
        );
        const categories = await Category.find({ status: 'Listed' }, 'name');

        const orphanedOffers = [
            ...productOffers.filter(offer => !offer.reference),
            ...categoryOffers.filter(offer => !offer.reference)
        ];
        
        if (orphanedOffers.length > 0) {
            await Offer.deleteMany({
                _id: { $in: orphanedOffers.map(offer => offer._id) }
            });
            console.log(`Cleaned up ${orphanedOffers.length} orphaned offers`);
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

// Check for existing offers
const checkExistingOffer = async (req, res) => {
    try {
        const { type, referenceId, excludeOfferId } = req.query;
        
        const query = {
            type,
            reference: referenceId,
            status: { $in: ['active', 'pending'] }
        };

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

// Create new offer
const createOffer = async (req, res) => {
    try {
        const { type, referenceId, discount, validFrom, validUntil } = req.body;
        
        if (!type || !referenceId || !discount || !validFrom || !validUntil) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 0 || discountValue > 90) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 0% and 90%'
            });
        }

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
                message: 'Valid Until date must be after Valid From date'
            });
        }

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

        const offer = new Offer({
            type,
            discount: discountValue,
            validFrom: fromDate,
            validUntil: untilDate,
            reference: referenceId,
            referenceModel: type === 'product' ? 'Product' : 'Category',
            status: new Date() >= fromDate && new Date() <= untilDate ? 'active' : 'pending'
        });

        if (type === 'product') {
            const product = await Product.findById(referenceId);
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

            offer.previousPrice = product.salePrice;
            await offer.save();

            product.productOffer = discountValue;
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

            const products = await Product.find({ category: referenceId });
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

            offer.previousPrices = products.map(product => ({
                productId: product._id,
                price: product.salePrice
            }));

            await offer.save();

            category.offer = discountValue;
            await category.save();

            if (offer.status === 'active') {
                for (const product of products) {
                    const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
                    const productOffer = await Offer.findOne({
                        type: 'product',
                        reference: product._id,
                        status: 'active'
                    });

                    let bestPrice = product.salePrice;
                    if (productOffer) {
                        const productDiscountedPrice = calculateDiscountedPrice(product.reqularPrice, productOffer.discount);
                        bestPrice = Math.min(bestPrice, productDiscountedPrice);
                    }
                    bestPrice = Math.min(bestPrice, discountedPrice);
                    
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
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create offer'
        });
    }
};

// Update existing offer
const updateOffer = async (req, res) => {
    try {
        const { offerId } = req.params;
        const { discount, validFrom, validUntil } = req.body;

        const offer = await Offer.findById(offerId);
        if (!offer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Offer not found' 
            });
        }

        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 0 || discountValue > 90) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 0% and 90%'
            });
        }

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
                message: 'Valid Until date must be after Valid From date'
            });
        }

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

            offer.discount = discountValue;
            offer.validFrom = fromDate;
            offer.validUntil = untilDate;
            offer.status = new Date() >= fromDate && new Date() <= untilDate ? 'active' : 'pending';

            await offer.save();

            product.productOffer = discountValue;
            if (offer.status === 'active') {
                product.salePrice = discountedPrice;
            } else {
                product.salePrice = offer.previousPrice || product.reqularPrice;
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

            offer.discount = discountValue;
            offer.validFrom = fromDate;
            offer.validUntil = untilDate;
            offer.status = new Date() >= fromDate && new Date() <= untilDate ? 'active' : 'pending';

            offer.previousPrices = products.map(product => ({
                productId: product._id,
                price: product.salePrice
            }));

            await offer.save();

            category.offer = discountValue;
            await category.save();

            if (offer.status === 'active') {
                for (const product of products) {
                    const discountedPrice = calculateDiscountedPrice(product.reqularPrice, discountValue);
                    const productOffer = await Offer.findOne({
                        type: 'product',
                        reference: product._id,
                        status: 'active'
                    });

                    let bestPrice = product.salePrice;
                    if (productOffer) {
                        const productDiscountedPrice = calculateDiscountedPrice(product.reqularPrice, productOffer.discount);
                        bestPrice = Math.min(bestPrice, productDiscountedPrice);
                    }
                    bestPrice = Math.min(bestPrice, discountedPrice);
                    
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
            message: error.message || 'Failed to update offer' 
        });
    }
};

// Delete offer
const deleteOffer = async (req, res) => {
    try {
        const { offerId } = req.params;
        console.log(`Starting deletion of offer ${offerId}`);

        const offer = await Offer.findById(offerId);
        if (!offer) {
            console.warn(`Offer ${offerId} not found`);
            return res.status(404).json({ 
                success: false, 
                message: 'Offer not found' 
            });
        }

        console.log(`Found offer ${offerId} of type ${offer.type} with reference ${offer.reference}`);

        if (offer.type === 'product') {
            const product = await Product.findById(offer.reference);
            if (product) {
                console.log(`Processing product ${product._id}`);
                product.productOffer = 0;
                const activeOffers = await Offer.find({
                    reference: product._id,
                    type: 'product',
                    status: 'active',
                    _id: { $ne: offerId }
                });

                const category = await Category.findById(product.category);
                const categoryOffer = category && category.offer ? parseFloat(category.offer) : 0;

                let bestPrice = offer.previousPrice || product.reqularPrice || product.salePrice;
                if (!bestPrice) {
                    console.warn(`No valid price found for product ${product._id}, defaulting to 0`);
                    bestPrice = 0;
                }

                activeOffers.forEach(activeOffer => {
                    try {
                        const discountedPrice = calculateDiscountedPrice(product.reqularPrice || bestPrice, activeOffer.discount);
                        bestPrice = Math.min(bestPrice, discountedPrice);
                    } catch (e) {
                        console.error(`Error calculating discount for product ${product._id}:`, e);
                    }
                });

                if (categoryOffer > 0) {
                    const categoryDiscountedPrice = calculateDiscountedPrice(product.reqularPrice || bestPrice, categoryOffer);
                    bestPrice = Math.min(bestPrice, categoryDiscountedPrice);
                }

                product.salePrice = bestPrice;
                await product.save();
                console.log(`Updated product ${product._id} with salePrice ${bestPrice}`);
            } else {
                console.warn(`Product not found for offer ${offerId}`);
            }
        } else if (offer.type === 'category') {
            console.log(`Processing category offer ${offerId}`);
            const category = await Category.findById(offer.reference);
            if (category) {
                console.log(`Found category ${category._id}`);
                category.offer = 0;
                await category.save();
                console.log(`Cleared offer from category ${category._id}`);

                const products = await Product.find({ category: offer.reference });
                console.log(`Found ${products.length} products for category ${category._id}`);

                for (const product of products) {
                    console.log(`Processing product ${product._id}`);
                    const activeProductOffers = await Offer.find({
                        reference: product._id,
                        type: 'product',
                        status: 'active'
                    });

                    const previousPriceData = Array.isArray(offer.previousPrices)
                        ? offer.previousPrices.find(p => {
                            try {
                                return p.productId && p.productId.equals(product._id);
                            } catch (e) {
                                console.error(`Invalid productId in previousPrices for product ${product._id}:`, e);
                                return false;
                            }
                        })
                        : null;

                    const previousPrice = previousPriceData 
                        ? previousPriceData.price 
                        : (product.salePrice || product.reqularPrice || 0);

                    if (!product.reqularPrice || isNaN(product.reqularPrice)) {
                        console.warn(`Invalid regular price for product ${product._id}, using fallback: ${previousPrice}`);
                    }

                    if (activeProductOffers.length > 0) {
                        let bestPrice = previousPrice;
                        activeProductOffers.forEach(productOffer => {
                            try {
                                const discountedPrice = calculateDiscountedPrice(
                                    product.reqularPrice || previousPrice,
                                    productOffer.discount
                                );
                                bestPrice = Math.min(bestPrice, discountedPrice);
                            } catch (e) {
                                console.error(`Error calculating discount for product ${product._id}:`, e);
                            }
                        });
                        product.salePrice = bestPrice;
                    } else {
                        product.salePrice = previousPrice;
                    }

                    await product.save();
                    console.log(`Updated product ${product._id} with salePrice ${product.salePrice}`);
                }
            } else {
                console.warn(`Category not found for offer ${offerId}, proceeding with offer deletion`);
            }
        } else {
            console.warn(`Unknown offer type ${offer.type} for offer ${offerId}`);
        }

        await Offer.findByIdAndDelete(offerId);
        console.log(`Successfully deleted offer ${offerId}`);

        return res.status(200).json({ 
            success: true, 
            message: 'Offer deleted successfully' 
        });
    } catch (error) {
        console.error(`Error in deleteOffer for offer ${req.params.offerId}:`, error);
        return res.status(500).json({ 
            success: false, 
            message: `Failed to delete offer: ${error.message}` 
        });
    }
};

// Update offer statuses automatically
const updateOfferStatuses = async () => {
    const currentDate = new Date();
    
    try {
        const offers = await Offer.find({
            $or: [
                {
                    status: 'pending',
                    validFrom: { $lte: currentDate },
                    validUntil: { $gte: currentDate }
                },
                {
                    status: 'active',
                    validUntil: { $lt: currentDate }
                }
            ]
        });

        for (const offer of offers) {
            const oldStatus = offer.status;
            
            if (currentDate < offer.validFrom) {
                offer.status = 'pending';
            } else if (currentDate > offer.validUntil) {
                offer.status = 'expired';
            } else {
                offer.status = 'active';
            }

            if (oldStatus !== offer.status) {
                await offer.save();

                if (offer.type === 'product') {
                    const product = await Product.findById(offer.reference);
                    if (product) {
                        if (offer.status === 'active') {
                            const discountedPrice = calculateDiscountedPrice(product.reqularPrice, offer.discount);
                            product.salePrice = discountedPrice;
                        } else {
                            product.salePrice = offer.previousPrice || product.reqularPrice;
                        }
                        await product.save();
                    }
                } else if (offer.type === 'category') {
                    const category = await Category.findById(offer.reference);
                    if (category) {
                        const products = await Product.find({ category: offer.reference });
                        
                        for (const product of products) {
                            const previousPrice = offer.previousPrices?.find(p => 
                                p.productId.toString() === product._id.toString()
                            )?.price || product.reqularPrice;

                            if (offer.status === 'active') {
                                const discountedPrice = calculateDiscountedPrice(product.reqularPrice, offer.discount);
                                product.salePrice = discountedPrice;
                            } else {
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