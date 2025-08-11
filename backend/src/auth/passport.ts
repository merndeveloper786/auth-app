import passport from "passport";
import {
  Strategy as GoogleStrategy,
  Profile,
  VerifyCallback,
} from "passport-google-oauth20";
import { prisma } from "../utils/prisma";

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: "http://localhost:5000/api/auth/google/callback",
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: VerifyCallback
    ) => {
      try {
        const email = profile.emails?.[0].value;
        if (!email) {
          return done(new Error("No email found in Google profile"), undefined);
        }
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          // Create new user
          user = await prisma.user.create({
            data: {
              name: profile.displayName,
              email,
              googleId: profile.id,
              profilePicture: profile.photos?.[0].value,
              provider: "google",
              age: null,
              gender: null,
              isProfileComplete: false,
            },
          });
        } else {
          // Update existing user with Google info
          const updateData: any = {
            googleId: profile.id,
            provider: "google",
          };

          // Update profile picture if not already set
          if (!user.profilePicture && profile.photos?.[0].value) {
            updateData.profilePicture = profile.photos[0].value;
          }

          // Update name if it's different
          if (user.name !== profile.displayName) {
            updateData.name = profile.displayName;
          }

          // Check if profile is complete
          const isProfileComplete = user.age !== null && user.gender !== null;
          updateData.isProfileComplete = isProfileComplete;

          user = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });
        }
        done(null, user);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  )
);
