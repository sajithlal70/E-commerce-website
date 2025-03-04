function calculateBestOffer(product) {
  // Default values
  let bestOffer = 0;
  let offerSource = '';
  
  // Get product offer if exists
  const productOffer = product.productOffer || 0;
  
  // Get category offer if category exists and has offer
  const categoryOffer = (product.category && product.category.offer) ? product.category.offer : 0;
  
  // Simply compare which offer is greater
  if (productOffer >= categoryOffer) {
    bestOffer = productOffer;
    offerSource = 'product';
  } else {
    bestOffer = categoryOffer;
    offerSource = 'category';
  }
  
  return {
    bestOffer,
    offerSource
  };
}

module.exports = {
  calculateBestOffer
}