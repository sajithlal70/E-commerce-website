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
const flash = require("express-flash")
db();

app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:true,
  cookie:{
    secure:false,
    httpOnly:true,
    maxAge:72*60*60*1000
  }
}))

app.set("view engine","ejs");
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname,"public")));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use(passport.initialize());
app.use(passport.session());

passportConfig(passport);

app.use("/",userRouter);

app.get("/logout",(req,res) => {
  req.logout((error) => {
    if(error) return res.status(500).send("Logout error");
    res.redirect("/signin");
  })
});

app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  next();
});

app.use("/admin",adminRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT http://localhost:${PORT}`);
});

module.exports = app;