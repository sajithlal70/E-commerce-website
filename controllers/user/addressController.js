const Address = require("../../models/addressSchema");
const User = require ("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const { CURSOR_FLAGS } = require("mongodb");

const getAddAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const [hasDefaultAddress, categories, user] = await Promise.all([
      Address.exists({ userId, 'address.default': true }),
      Category.find().lean(),
      User.findById(userId).lean()
    ]);

    const isCheckout = req.query.checkout === 'true';
    const template = isCheckout ? 'user/checkout-address' : 'addAddress';

    res.render(template, {
      isEdit: false,
      hasDefaultAddress,
      address: null,
      categories,
      user,
      currentPath: req.path
    });
  } catch (error) {
    console.error("Error loading Add Address page:", error);
    res.status(500).send("Server Error");
  }
};

const getAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    // Pagination parameters with validation
    const page = Math.max(1, parseInt(req.query.page) || 1); // Ensure page is at least 1
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 2)); // Limit between 1 and 10, default 6
    const skip = (page - 1) * limit;

    // Find the address document for the user with lean() for better performance
    const addressDocument = await Address.findOne({ userId }).lean();

    if (!addressDocument) {
      return res.render('address', {
        addresses: { address: [] },
        products: await Product.find().select('name price').lean(),
        categories: await Category.find().select('name').lean(),
        user: await User.findById(userId).select('name email').lean(),
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          limit,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    }

    // Get total count of addresses
    const totalAddresses = addressDocument.address.length;
    const totalPages = Math.ceil(totalAddresses / limit);

    // Validate current page
    if (page > totalPages && totalPages > 0) {
      return res.redirect(`/address?page=${totalPages}`);
    }

    // Sort addresses by default status and creation date
    const sortedAddresses = addressDocument.address.sort((a, b) => {
      if (a.default === b.default) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return b.default ? 1 : -1;
    });

    // Apply pagination to sorted addresses
    const paginatedAddresses = sortedAddresses.slice(skip, skip + limit).map(addr => ({
      ...addr,
      isDefault: addr.default
    }));

    // Fetch only necessary fields from products and categories
    const [products, categories, user] = await Promise.all([
      Product.find().select('name price').lean(),
      Category.find().select('name').lean(),
      User.findById(userId).select('name email').lean()
    ]);

    // Create pagination metadata
    const pagination = {
      currentPage: page,
      totalPages,
      totalItems: totalAddresses,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      startIndex: skip + 1,
      endIndex: Math.min(skip + limit, totalAddresses)
    };

    // Render the address page with pagination metadata
    res.render('address', {
      addresses: { 
        address: paginatedAddresses
      },
      products,
      categories,
      user,
      pagination,
      query: req.query // Pass query parameters back to the view
    });

  } catch (error) {
    console.error("Error loading Address page:", error);
    res.status(500).render('error', {
      message: "An error occurred while loading addresses",
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

const getEditAddress = async (req, res) => {   
  try {     
    const userId = req.session.user._id; 
    const addressId = req.params.id; 
    const isCheckout = req.query.checkout === 'true';

    const addressData = await Address.findOne(
      { 
        userId: userId, 
        'address._id': addressId 
      },
      { 'address.$': 1, userId: 1 }
    ).lean();

    if (!addressData) {
      return res.status(404).send('No address found');
    }

    const address = addressData.address[0];
    const [products, categories] = await Promise.all([
      Product.find().lean(),
      Category.find().lean()
    ]);

    const template = isCheckout ? 'user/checkout-address' : 'editaddress';

    res.render(template, {
      products,
      categories,
      user: addressData.userId,
      address,
      isEdit: true,
      hasDefaultAddress: true,
      currentPath: req.path
    });
  } catch (error) {
    console.error('Error loading edit address page:', error);
    res.status(500).send('Internal Server Error');
  } 
};

const saveAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const isCheckout = req.query.checkout === 'true';
    
    let userAddress = await Address.findOne({ userId });
    if (!userAddress) {
      userAddress = new Address({ userId, address: [] });
    }

    const newAddress = {
      ...req.body,
      default: req.body.isDefault === 'true' || userAddress.address.length === 0
    };

    if (newAddress.default) {
      userAddress.address.forEach(addr => addr.default = false);
    }

    userAddress.address.push(newAddress);
    await userAddress.save();

    const redirectUrl = isCheckout ? 
      (userAddress.address.length === 1 ? '/checkout' : '/checkout/addresses') : 
      '/address';

    res.status(201).json({
      success: true,
      message: "Address saved successfully",
      redirectUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      error: "An error occurred while saving the address",
      details: error.message 
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user._id;

    // Find the address document and remove the specific address
    const result = await Address.findOneAndUpdate(
      { userId: userId },
      { $pull: { address: { _id: id } } },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or you do not have permission to delete this address'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.params.id;

        // Find the user's address document
        const addressDoc = await Address.findOne({ userId });
        
        if (!addressDoc || !addressDoc.address) {
            return res.status(404).json({
                success: false,
                message: 'No addresses found'
            });
        }

        // Find the specific address in the array
        const addressIndex = addressDoc.address.findIndex(
            addr => addr._id.toString() === addressId
        );

        if (addressIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Set all addresses to non-default
        addressDoc.address.forEach(addr => {
            addr.default = false;
        });

        // Set the selected address as default
        addressDoc.address[addressIndex].default = true;

        // Save the changes
        await addressDoc.save();

        res.json({
            success: true,
            message: 'Default address updated successfully'
        });

    } catch (error) {
        console.error('Error setting default address:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set default address'
        });
    }
};

const editAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user._id;
    const isCheckout = req.query.checkout === 'true';

    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: 'Request body is missing'
      });
    }

    const updatedAddressData = {
      ...req.body,
      default: req.body.default === 'true' || req.body.isDefault === 'true'
    };

    // Validate required fields
    const requiredFields = ['name', 'phone', 'postalCode', 'street', 'city', 'addressType'];
    const missingFields = requiredFields.filter(field => !updatedAddressData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate field formats
    if (!/^\d{10}$/.test(updatedAddressData.phone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be exactly 10 digits'
      });
    }

    if (!/^\d{6}$/.test(updatedAddressData.postalCode)) {
      return res.status(400).json({
        success: false,
        message: 'Postal code must be exactly 6 digits'
      });
    }

    // Find the current address to check if it exists and if it's default
    const currentAddress = await Address.findOne(
      { userId, 'address._id': id },
      { 'address.$': 1 }
    ).lean();

    if (!currentAddress) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const isCurrentDefault = currentAddress?.address[0]?.default;

    // If this address was default, keep it default
    if (isCurrentDefault) {
      updatedAddressData.default = true;
    }

    // Find and update the address
    const updatedDocument = await Address.findOneAndUpdate(
      { 
        userId: userId, 
        'address._id': id 
      },
      { 
        $set: { 
          'address.$': {
            ...updatedAddressData,
            _id: id // Preserve the original _id
          }
        } 
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!updatedDocument) {
      return res.status(404).json({
        success: false,
        message: 'Failed to update address'
      });
    }

    // Return success response with redirection URL
    const redirectUrl = isCheckout ? '/checkout' : '/address';

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      data: updatedDocument,
      redirectUrl
    });

  } catch (error) {
    console.error('Error editing address:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const getAddresses = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const userAddresses = await Address.findOne({ userId });

        console.log('Retrieved addresses:', userAddresses);

        res.render('user/checkout-addresses', {
            addresses: userAddresses ? userAddresses.address : [],
            user: req.session.user
        });
    } catch (error) {
        console.error('Get addresses error:', error);
        req.flash('error', 'Failed to load addresses');
        res.redirect('/checkout');
    }
};

const selectAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;

    // Check if user is authenticated
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address document not found'
      });
    }

    const address = addressDoc.address.find(addr => addr._id.toString() === addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    req.session.selectedAddressId = addressId;

    res.json({
      success: true,
      message: 'Address selected successfully'
    });
  } catch (error) {
    console.error('Error selecting address:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  getAddAddress,
  getAddress,
  saveAddress,
  deleteAddress,
  setDefaultAddress,
  getEditAddress,
  editAddress,
  getAddresses,
  selectAddress
}