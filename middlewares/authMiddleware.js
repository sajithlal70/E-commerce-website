const User = require('../models/userSchema');

const isAuth = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
    if (req.session.user) {
        next();
    } else {
        res.redirect('/signin');
    }
};

const isAuthApi = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({
            success: false,
            message: 'Please sign in to continue'
        });
    }
};

const isBlocked = async (req, res, next) => {
    try {
        // Check if user is logged in
        if (!req.session.user) {
            return res.redirect('/signin');
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);

        if (!user) {
            req.session.destroy();
            return res.redirect('/signin');
        }

        if (user.isBlocked) {
            req.session.destroy();
            req.flash('error', 'Your account has been blocked. Please contact support.');
            return res.redirect('/signin');
        }

        next();
    } catch (error) {
        console.error('Error checking user block status:', error);
        res.status(500).render('error', {
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
};

// Admin Auth MIddle ware set up

const adminAuth = (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    req.admin = req.session.admin;
    if (req.session.admin) {
      next(); 
    } else {
    
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.'
        });
      } else {
        res.redirect('/admin/login');
      }
    }
  } catch (error) {
    console.error('Error in admin authentication:', error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.status(500).json({
        success: false,
        message: 'Authentication error occurred'
      });
    } else {
      res.redirect('/pageerror');
    }
  }
};

const redirectIfLoggedIn = (req, res, next) => {
  try {
      if (req.session.admin) {
          res.redirect('/admin/dashboard');
      } else {
          next(); 
      }
  } catch (error) {
      console.error('Error in redirect middleware:', error);
      res.redirect('/pageerror');
  }
};

module.exports = {
    isAuth,
    isAuthApi,
    isBlocked,
    adminAuth,
    redirectIfLoggedIn
};


