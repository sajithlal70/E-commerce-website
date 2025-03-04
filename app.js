const express = require('express');
const app = express();
const path = require('path');
const env = require('dotenv').config();
const passport = require("passport");
const session = require("express-session");
const db = require ("./config/db");
const userRouter = require("./routes/userRouter");
const passportConfig = require("./config/passportconfig")
const adminRouter = require("./routes/adminRouter");
const { error } = require('console');
const methodOverride = require('method-override');
const flash = require('connect-flash');
const nocache = require('nocache');
const bcrypt = require('bcryptjs');

db();

app.use(express.json());
app.use(nocache());
app.use(express.urlencoded({extended:true}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

app.use(flash());
app.use((req, res, next) => {
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    warning: req.flash('warning')
  };
  res.locals.categories = [];
  res.locals.user = req.user;
  next();
});

app.set("view engine","ejs");
app.set("views",[
    path.join(__dirname,'views/user'),
    path.join(__dirname,'views/admin'),
    path.join(__dirname,'views') 
]);
app.use(express.static(path.join(__dirname,"public")));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use(passport.initialize());
app.use(passport.session());

passportConfig(passport);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.use("/",userRouter);
app.use(methodOverride('_method'));

app.use("/admin",adminRouter);

// Update the Invalid MongoDB ObjectId handler
app.use((err, req, res, next) => {
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        // Check if it's an API request
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format'
            });
        }
        // For regular requests
        return res.status(404).render('404', {
            message: 'Invalid ID format. Please check the URL and try again.'
        });
    }
    next(err);
});

// 404 handler
app.use((req, res, next) => {
  // Check if it's an API request
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  }

  // For regular requests, render the 404 page
  res.status(404).render('404', {
    message: "The page you're looking for doesn't exist or has been moved.",
    categories: res.locals.categories || [], // Pass categories for header menu
    user: req.user || null // Pass user info for header
  });
});

// Update the global error handler
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.status || 500;
    const errorMessage = process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'Something went wrong. Please try again later.';

     app.locals.baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://dentkart.shop' || 'https://www.dentkart.shop' 
        : 'http://localhost:3000';


    // For API requests
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(statusCode).json({
            success: false,
            message: errorMessage
        });
    }

    // For 404 errors
    if (statusCode === 404) {
        return res.status(404).render('404', {
            message: errorMessage,
            categories: res.locals.categories || [],
            user: req.user || null
        });
    }

    // For other errors
    res.status(statusCode).render('error', {
        error: {
            message: errorMessage,
            stack: process.env.NODE_ENV === 'development' ? err.stack : ''
        },
        categories: res.locals.categories || [],
        user: req.user || null
    });
});

const port = process.env.PORT || 3000;
app.listen(port, (err) => {
    if (err) {
        console.error('Error starting server:', err);
        return;
    }
    console.log(`SERVER RUNNING ON PORT http://localhost:${port}`);
});

module.exports = app;