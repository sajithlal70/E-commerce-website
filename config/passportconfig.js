const GoogleStrategy = require("passport-google-oauth20").Strategy;
const passport = require("passport");
const User = require("../models/userSchema");

module.exports = (passport) => {
  
  passport.serializeUser((user, done) => done(null, user.id));

 
  passport.deserializeUser((id, done) => {
    User.findById(id)
      .then((user) => done(null, user))
      .catch((error) => done(error, null));
  });

  
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            
            user = await User.findOne({ email: profile.emails[0].value });

            if (user) {
              
              user.googleId = profile.id;
              await user.save();
            } else {
              
              user = new User({
                googleId: profile.id,
                name: profile.displayName,
                email: profile.emails[0].value,
              });
              await user.save();
            }
          }

          return done(null, user); 
        } catch (error) {
          console.error("Error in Google Auth:", error);
          return done(error, null); 
        }
      }
    )
  );
};
