async function updateCartItem(productId, quantity) {
    try {
        const response = await fetch('/cart/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ productId, quantity })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update cart UI
            updateCartDisplay(data.data);

            // Handle coupon removal if applicable
            if (data.data.couponRemoved) {
                await Swal.fire({
                    icon: 'info',
                    title: 'Coupon Removed',
                    text: 'Your applied coupon has been removed due to cart changes',
                    timer: 3000,
                    showConfirmButton: false,
                    position: 'top-end',
                    toast: true
                });
            }
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Cart update error:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to update cart',
            confirmButtonColor: '#EAB308'
        });
    }
} 