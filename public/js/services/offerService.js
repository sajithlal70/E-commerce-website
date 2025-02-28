class OfferService {
    static async createOffer(offerData) {
        try {
            const response = await fetch('/admin/offers/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(offerData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error creating offer:', error);
            throw error;
        }
    }

    static async updateOffer(offerId, offerData) {
        try {
            const response = await fetch(`/admin/offers/update/${offerId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(offerData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error updating offer:', error);
            throw error;
        }
    }

    static async deleteOffer(offerId) {
        try {
            const response = await fetch(`/admin/offers/delete/${offerId}`, {
                method: 'DELETE'
            });
            return await response.json();
        } catch (error) {
            console.error('Error deleting offer:', error);
            throw error;
        }
    }

    static async getAllOffers() {
        try {
            const response = await fetch('/admin/offers/all');
            return await response.json();
        } catch (error) {
            console.error('Error fetching offers:', error);
            throw error;
        }
    }

    // Helper function to calculate discounted price
    static calculateDiscountedPrice(originalPrice, discountPercentage) {
        return originalPrice - (originalPrice * (discountPercentage / 100));
    }

    // Helper function to get the best price (minimum of sale price and offer price)
    static getBestPrice(regularPrice, salePrice, offerPrice) {
        const prices = [salePrice];
        if (offerPrice) {
            prices.push(offerPrice);
        }
        return Math.min(...prices);
    }
}

// Export for use in other files
window.OfferService = OfferService; 