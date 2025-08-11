import passport from "passport";
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import crypto from "crypto";
import { prisma } from "../utils/prisma";
import { uploadImage } from "../utils/cloudinary";
import { authLimiter } from "../middleware/rateLimit";

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Helper function to generate JWT token
const generateToken = (userId: string) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
};

// Helper function to validate email
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to validate age
const isValidAge = (age: number) => {
  return age >= 13 && age <= 120;
};

// Helper function to validate gender
const isValidGender = (gender: string) => {
  return ["male", "female", "other", "prefer-not-to-say"].includes(
    gender.toLowerCase()
  );
};

// Signup route
router.post(
  "/signup",
  authLimiter,
  upload.single("profilePicture"),
  async (req: Request, res: Response) => {
    try {
      const { name, email, password, age, gender } = req.body;

      // Validation
      if (!name || !email || !password) {
        return res
          .status(400)
          .json({ error: "Name, email, and password are required" });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters long" });
      }

      if (age && !isValidAge(Number(age))) {
        return res
          .status(400)
          .json({ error: "Age must be between 13 and 120" });
      }

      if (gender && !isValidGender(gender)) {
        return res.status(400).json({ error: "Invalid gender selection" });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User with this email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Upload profile picture if provided
      let profilePictureUrl = null;
      if (req.file) {
        try {
          profilePictureUrl = await uploadImage(req.file);
        } catch (error) {
          return res.status(400).json({ error: "Failed to upload image" });
        }
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          age: age ? Number(age) : null,
          gender: gender ? gender.toLowerCase() : null,
          profilePicture: profilePictureUrl,
          provider: "credentials",
          isProfileComplete: !!(age && gender),
        },
        select: {
          id: true,
          name: true,
          email: true,
          age: true,
          gender: true,
          profilePicture: true,
          provider: true,
          createdAt: true,
        },
      });

      // Generate token
      const token = generateToken(user.id);

      res.status(201).json({
        message: "User created successfully",
        user,
        token,
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Login route
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if user has password (OAuth users might not have password)
    if (!user.password) {
      return res.status(401).json({ error: "Please login with Google" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = generateToken(user.id);

    // Return user data (excluding password)
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: "Login successful",
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback - updated to redirect to profile completion
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "http://localhost:3000/signin",
    session: false,
  }),
  async (req: Request, res: Response) => {
    const passportUser = req.user as any;

    // Fetch complete user data from database
    const user = await prisma.user.findUnique({
      where: { id: passportUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        age: true,
        gender: true,
        profilePicture: true,
        provider: true,
        isProfileComplete: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.redirect("http://localhost:3000/signin?error=user_not_found");
    }

    // Check if user profile is complete
    if (!user.age || !user.gender || !user.isProfileComplete) {
      // Redirect to profile completion page
      const token = generateToken(user.id);
      const redirectUrl = `http://localhost:3000/complete-profile?token=${token}&user=${encodeURIComponent(
        JSON.stringify({
          id: user.id,
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture,
          provider: user.provider,
          age: user.age,
          gender: user.gender,
          createdAt: user.createdAt,
        })
      )}`;
      res.redirect(redirectUrl);
    } else {
      // Profile is complete, redirect to profile page
      const token = generateToken(user.id);
      const redirectUrl = `http://localhost:3000/profile?token=${token}&user=${encodeURIComponent(
        JSON.stringify({
          id: user.id,
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture,
          provider: user.provider,
          age: user.age,
          gender: user.gender,
          createdAt: user.createdAt,
        })
      )}`;
      res.redirect(redirectUrl);
    }
  }
);

// Complete profile for Google OAuth users
router.post(
  "/complete-profile",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { age, gender, password } = req.body;
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).json({ error: "No token provided" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

      if (!age || !gender) {
        return res.status(400).json({ error: "Age and gender are required" });
      }

      if (!isValidAge(Number(age))) {
        return res
          .status(400)
          .json({ error: "Age must be between 13 and 120" });
      }

      if (!isValidGender(gender)) {
        return res.status(400).json({ error: "Invalid gender selection" });
      }

      // Get current user to check provider
      const currentUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { provider: true },
      });

      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prepare update data
      const updateData: any = {
        age: Number(age),
        gender: gender.toLowerCase(),
        isProfileComplete: true,
      };

      // Handle password for Google users
      if (currentUser.provider === "google" && password) {
        if (password.length < 6) {
          return res
            .status(400)
            .json({ error: "Password must be at least 6 characters long" });
        }
        updateData.password = await bcrypt.hash(password, 12);
      }

      const updatedUser = await prisma.user.update({
        where: { id: decoded.userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          age: true,
          gender: true,
          profilePicture: true,
          provider: true,
          createdAt: true,
        },
      });

      res.json({
        message: "Profile completed successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Complete profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Logout route (client-side token removal)
router.post("/logout", (req: Request, res: Response) => {
  res.json({ message: "Logged out successfully" });
});

// Get current user
router.get("/me", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        age: true,
        gender: true,
        profilePicture: true,
        provider: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
