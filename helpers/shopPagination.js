function getQueryString(query, excludeParams = []) {
  const params = new URLSearchParams(query);
  excludeParams.forEach(param => params.delete(param));
  const queryString = params.toString();
  return queryString ? `&${queryString}` : '';
}

// Helper function to generate pagination links with preserved filters
const generatePaginationLinks = (currentPage, totalPages, params = {}) => {
  const { search, category, sort, price } = params;
  
  const createUrl = (page) => {
    const queryParams = new URLSearchParams();
    queryParams.set('page', page);
    if (search) queryParams.set('search', search);
    if (category) queryParams.set('category', category);
    if (sort) queryParams.set('sort', sort);
    if (price) queryParams.set('price', price);
    return `/shop?${queryParams.toString()}`;
  };

  return {
    prevPage: currentPage > 1 ? createUrl(currentPage - 1) : null,
    nextPage: currentPage < totalPages ? createUrl(currentPage + 1) : null,
    firstPage: currentPage > 2 ? createUrl(1) : null,
    lastPage: currentPage < totalPages - 1 ? createUrl(totalPages) : null,
    pages: Array.from({ length: totalPages }, (_, i) => ({
      number: i + 1,
      url: createUrl(i + 1),
      isCurrent: i + 1 === currentPage
    }))
  };
};

module.exports = {
  generatePaginationLinks,
  getQueryString
}