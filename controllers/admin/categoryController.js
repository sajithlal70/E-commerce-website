const { name } = require("ejs");
const Category = require("../../models/categorySchema");

const categoryInfo = async (req,res)=>{

  try {

    const page = parseInt(req.query.page) || 1 ;
    const limit = 4 ;
    const skip = (page-1)*limit;

    const categoryData = await Category.find({})
    .sort({createdAt:-1})
    .skip(skip)
    .limit(limit);

    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);
    const adminName =  req.session.admin.name
    
    res.render("category",{
      cat: categoryData,
      currentPage:page,
      totalPages : totalPages,
      totalCategories : totalCategories,
      adminName
    });
    
  } catch (error) {
    
    console.error(error);
    res.status(500).json({error:"Error for fectiching category Details"})
  }
}

const addCategory = async (req,res) => {

  const { name, description, offerPrice, offer } = req.body;

  try {
    const existingCategory = await Category.findOne({name});
    if(existingCategory){
      return res.status(400).json({error:"Category already exists"})
    }

    const newCategory = new Category ({
      name,
      description,
      offerPrice,
      offer,
      status:'Listed',
    })

    await newCategory.save();
    return res.redirect('/admin/category');

  } catch (error) {

    console.error(error);

    return res.status(500).json({error:"Internal server error "})
    
  }
}

const editCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description, offerPrice, offer } = req.body;

  try {
    // Find and update the category
    const updatedCategory = await Category.findByIdAndUpdate(
      id, 
      { 
        name, 
        description, 
        offerPrice, 
        offer 
      }, 
      { new: true } // Return the updated document
    );

    if (!updatedCategory) {
      return res.status(404).render('error', { message: "Category not found" });
    }

    // Redirect back to category page
    res.redirect('/admin/category');

  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: "Error updating category" });
  }
}

const toggleCategoryStatus = async (req,res) => {
  const { id } = req.params ;

  try {
    const category = await Category.findById(id);
    if(!category) {
      return res.status(404).json({error:"Category not found"});
    }
    category.status = category.status === 'Listed' ? 'Unlisted' : 'Listed' ; 
    await category.save();
    return res.redirect('/admin/category');
  }
  catch(error) {
    console.error(error);
    return res.status(500).json({error:"Internal server error"});
  }
}



module.exports = {
  categoryInfo,
  addCategory,
  toggleCategoryStatus,
  editCategory,
//   editCategory,
//   deleteCategory,
// }
}