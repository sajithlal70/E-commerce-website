const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

const renderInventoryPage = async (req, res) => {
    try {
        // Get query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const categoryFilter = req.query.category || '';
        const statusFilter = req.query.status || '';
        
        // Build filter object
        const filter = {};
        if (search) {
            filter.productName = { $regex: search, $options: 'i' };
        }
        if (categoryFilter) {
            filter.category = categoryFilter;
        }
        if (statusFilter) {
            filter.status = statusFilter;
        }

        const skip = (page - 1) * limit;
        
        // Get total filtered products count
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        // Get filtered products
        const products = await Product.find(filter)
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Update status for any products with 0 quantity
        for (const product of products) {
            if (product.quantity === 0 && product.status === 'Available') {
                product.status = 'out of stock';
                await product.save();
            }
        }

        const categories = await Category.find({ status: 'Listed' });
        
        // Get inventory statistics
        const inventoryStats = {
            totalProducts: await Product.countDocuments(),
            availableProducts: await Product.countDocuments({ 
                status: 'Available',
                quantity: { $gt: 0 }  // Only count products with stock > 0 as available
            }),
            outOfStockProducts: await Product.countDocuments({ 
                $or: [
                    { status: 'out of stock' },
                    { quantity: 0, status: { $ne: 'Discontinued' } }  // Include all products with 0 stock
                ]
            }),
            discontinuedProducts: await Product.countDocuments({ status: 'Discontinued' })
        };

        res.render('inventory', { 
            products, 
            categories,
            stats: inventoryStats,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                limit: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            filters: {
                search,
                category: categoryFilter,
                status: statusFilter
            }
        });
    } catch (error) {
        console.error('Inventory rendering error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error loading inventory'
        });
    }
};

const updateStock = async (req, res) => {
    try {
        const { productId } = req.params;
        const { quantity } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found'
            });
        }

        // Update quantity and status
        product.quantity = quantity;
        // Only set to Available if product is not discontinued and has stock
        if (quantity > 0 && product.status !== 'Discontinued') {
            product.status = 'Available';
        } else if (quantity === 0 && product.status !== 'Discontinued') {
            product.status = 'out of stock';
        }
        await product.save();

        res.json({ 
            success: true, 
            message: 'Stock updated successfully'
        });
    } catch (error) {
        console.error('Stock update error:', error);
        res.status(400).json({ 
            success: false, 
            message: 'Error updating stock'
        });
    }
};

const softDeleteProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found'
            });
        }

        product.status = 'Discontinued';
        await product.save();

        res.json({ 
            success: true, 
            message: 'Product discontinued successfully'
        });
    } catch (error) {
        console.error('Product soft delete error:', error);
        res.status(400).json({ 
            success: false, 
            message: 'Error discontinuing product'
        });
    }
};


const reactivateProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found'
            });
        }

        // Check if product has stock
        if (product.quantity > 0) {
            product.status = 'Available';
        } else {
            product.status = 'out of stock';
        }
        await product.save();

        res.json({ 
            success: true, 
            message: 'Product reactivated successfully'
        });
    } catch (error) {
        console.error('Product reactivation error:', error);
        res.status(400).json({ 
            success: false, 
            message: 'Error reactivating product'
        });
    }
};

module.exports = {
    renderInventoryPage,
    updateStock,
    softDeleteProduct,
    reactivateProduct
};