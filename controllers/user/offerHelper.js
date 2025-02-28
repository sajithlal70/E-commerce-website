const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// Helper function to calculate discounted price
const calculateDiscountedPrice = (originalPrice, discountPercentage) => {
    const discount = (parseFloat(originalPrice) * parseFloat(discountPercentage)) / 100;
    return parseFloat(originalPrice) - discount;
};

// Get active offers for a product
const getActiveProductOffers = async (productId) => {
    try {
        const currentDate = new Date();
        
        // Get direct product offers
        const productOffer = await Offer.findOne({
            type: 'product',
            reference: productId,
            status: 'active',
            validFrom: { $lte: currentDate },
            validUntil: { $gte: currentDate }
        }).select('discount');

        // Get the product to find its category
        const product = await Product.findById(productId).select('category');
        
        // Get category offers
        const categoryOffer = await Offer.findOne({
            type: 'category',
            reference: product.category,
            status: 'active',
            validFrom: { $lte: currentDate },
            validUntil: { $gte: currentDate }
        }).select('discount');

        return {
            productOffer: productOffer?.discount || 0,
            categoryOffer: categoryOffer?.discount || 0,
            bestOffer: Math.max(productOffer?.discount || 0, categoryOffer?.discount || 0)
        };
    } catch (error) {
        console.error('Error getting active offers:', error);
        return {
            productOffer: 0,
            categoryOffer: 0,
            bestOffer: 0
        };
    }
};

// Get all active offers for multiple products
const getActiveOffersForProducts = async (products) => {
    try {
        const currentDate = new Date();
        // Filter out products without valid IDs and categories
        const validProducts = products.filter(p => p && p._id && p.category);
        
        const productIds = validProducts.map(p => p._id);
        const categoryIds = [...new Set(validProducts.map(p => p.category))];

        // Fetch all relevant active offers in parallel
        const [productOffers, categoryOffers] = await Promise.all([
            Offer.find({
                type: 'product',
                reference: { $in: productIds },
                status: 'active',
                validFrom: { $lte: currentDate },
                validUntil: { $gte: currentDate }
            }).select('reference discount'),
            Offer.find({
                type: 'category',
                reference: { $in: categoryIds },
                status: 'active',
                validFrom: { $lte: currentDate },
                validUntil: { $gte: currentDate }
            }).select('reference discount')
        ]);

        // Create maps for quick lookup
        const productOffersMap = new Map(
            productOffers
                .filter(o => o && o.reference)
                .map(o => [o.reference.toString(), o.discount])
        );
        const categoryOffersMap = new Map(
            categoryOffers
                .filter(o => o && o.reference)
                .map(o => [o.reference.toString(), o.discount])
        );

        // Calculate best offers for each product
        const offersMap = new Map();
        validProducts.forEach(product => {
            try {
                const productId = product._id.toString();
                const categoryId = product.category.toString();
                
                const productOffer = productOffersMap.get(productId) || 0;
                const categoryOffer = categoryOffersMap.get(categoryId) || 0;
                const bestOffer = Math.max(productOffer, categoryOffer);
                
                offersMap.set(productId, {
                    productOffer,
                    categoryOffer,
                    bestOffer,
                    discountedPrice: bestOffer > 0 
                        ? calculateDiscountedPrice(product.reqularPrice || product.salePrice, bestOffer) 
                        : product.salePrice
                });
            } catch (err) {
                console.error(`Error processing offers for product ${product._id}:`, err);
                // Set default values for products with errors
                offersMap.set(product._id.toString(), {
                    productOffer: 0,
                    categoryOffer: 0,
                    bestOffer: 0,
                    discountedPrice: product.salePrice
                });
            }
        });

        return offersMap;
    } catch (error) {
        console.error('Error getting active offers for products:', error);
        return new Map();
    }
};

// Get active category offers
const getActiveCategoryOffers = async () => {
    try {
        const currentDate = new Date();
        const categoryOffers = await Offer.find({
            type: 'category',
            status: 'active',
            validFrom: { $lte: currentDate },
            validUntil: { $gte: currentDate }
        }).populate('reference', 'name').select('reference discount');

        return categoryOffers;
    } catch (error) {
        console.error('Error getting active category offers:', error);
        return [];
    }
};

module.exports = {
    calculateDiscountedPrice,
    getActiveProductOffers,
    getActiveOffersForProducts,
    getActiveCategoryOffers
}; 