import { Router, Request, Response } from "express";
import multer from "multer";
import { prisma } from "../utils/prisma";
import { uploadImage, deleteImage } from "../utils/cloudinary";
import { authenticateToken } from "../middleware/auth";
import { uploadLimiter } from "../middleware/rateLimit";
import bcrypt from "bcryptjs";

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

// Get all users (for the users page)
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
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
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ users });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user's profile
router.get(
  "/profile",
  authenticateToken,
  async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          name: true,
          email: true,
          age: true,
          gender: true,
          profilePicture: true,
          provider: true,
          password: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ user: dbUser });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update user profile
router.put(
  "/profile",
  authenticateToken,
  upload.single("profilePicture"),
  async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const { name, age, gender } = req.body;

      // Validation
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      if (age && !isValidAge(Number(age))) {
        return res
          .status(400)
          .json({ error: "Age must be between 13 and 120" });
      }

      if (gender && !isValidGender(gender)) {
        return res.status(400).json({ error: "Invalid gender selection" });
      }

      // Get current user to check if they have a profile picture
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { profilePicture: true },
      });

      let profilePictureUrl = currentUser?.profilePicture;

      // Upload new profile picture if provided
      if (req.file) {
        try {
          // Delete old image if it exists
          if (currentUser?.profilePicture) {
            try {
              await deleteImage(currentUser.profilePicture);
            } catch (error) {
              console.error("Error deleting old image:", error);
            }
          }

          // Upload new image
          profilePictureUrl = await uploadImage(req.file);
        } catch (error) {
          return res.status(400).json({ error: "Failed to upload image" });
        }
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          name,
          age: age ? Number(age) : undefined,
          gender: gender ? gender.toLowerCase() : undefined,
          profilePicture: profilePictureUrl,
          isProfileComplete: !!(age && gender),
          updatedAt: new Date(),
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
          updatedAt: true,
        },
      });

      res.json({
        message: "Profile updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get user by ID (for viewing other users' profiles)
router.get(
  "/:userId",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
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

      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ user: dbUser });
    } catch (error) {
      console.error("Get user by ID error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete profile picture
router.delete(
  "/profile/picture",
  authenticateToken,
  async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { profilePicture: true },
      });

      if (!currentUser?.profilePicture) {
        return res.status(400).json({ error: "No profile picture to delete" });
      }

      // Delete from Cloudinary
      try {
        await deleteImage(currentUser.profilePicture);
      } catch (error) {
        console.error("Error deleting image from Cloudinary:", error);
      }

      // Update user to remove profile picture
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          profilePicture: null,
          updatedAt: new Date(),
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
          updatedAt: true,
        },
      });

      res.json({
        message: "Profile picture deleted successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Delete profile picture error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Change password for authenticated user
router.post(
  "/change-password",
  authenticateToken,
  async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const { currentPassword, newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "New password must be at least 6 characters long" });
      }

      // Get current user with password
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          password: true,
          provider: true,
        },
      });

      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // For Google users, current password is optional if they don't have one set
      if (dbUser.provider === "google" && !dbUser.password) {
        // Google user without password - just set the new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            password: hashedNewPassword,
          },
        });

        res.json({ message: "Password set successfully" });
        return;
      }

      // For users with existing passwords, current password is required
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required" });
      }

      if (!dbUser.password) {
        return res
          .status(400)
          .json({ error: "Password change not available for this user" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        dbUser.password
      );
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedNewPassword,
        },
      });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Import rate limiter for analytics
import rateLimit from "express-rate-limit";

// Analytics rate limiter
const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5000, // allow more requests for analytics
  message: "Too many analytics requests, please try again later.",
});

// Analytics endpoints for dashboard
router.get(
  "/analytics/overview",
  analyticsLimiter,
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const totalUsers = await prisma.user.count();

      // Users registered in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newUsers = await prisma.user.count({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      });

      // Users registered in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weeklyUsers = await prisma.user.count({
        where: {
          createdAt: {
            gte: sevenDaysAgo,
          },
        },
      });

      // Users registered today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayUsers = await prisma.user.count({
        where: {
          createdAt: {
            gte: today,
          },
        },
      });

      res.json({
        totalUsers,
        newUsers,
        weeklyUsers,
        todayUsers,
      });
    } catch (error) {
      console.error("Error fetching overview analytics:", error);
      res.status(500).json({ error: "Failed to fetch overview analytics" });
    }
  }
);

// Gender distribution analytics
router.get(
  "/analytics/gender",
  analyticsLimiter,
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const genderStats = await prisma.user.groupBy({
        by: ["gender"],
        _count: {
          gender: true,
        },
      });

      const genderData = genderStats.map((stat) => ({
        gender: stat.gender || "Not specified",
        count: stat._count.gender,
      }));

      res.json(genderData);
    } catch (error) {
      console.error("Error fetching gender analytics:", error);
      res.status(500).json({ error: "Failed to fetch gender analytics" });
    }
  }
);

// Age distribution analytics
router.get(
  "/analytics/age",
  analyticsLimiter,
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          age: true,
        },
        where: {
          age: {
            not: null,
          },
        },
      });

      // Group users by age ranges
      const ageGroups = {
        "13-17": 0,
        "18-24": 0,
        "25-34": 0,
        "35-44": 0,
        "45-54": 0,
        "55-64": 0,
        "65+": 0,
      };

      users.forEach((user) => {
        const age = user.age!;
        if (age >= 13 && age <= 17) ageGroups["13-17"]++;
        else if (age >= 18 && age <= 24) ageGroups["18-24"]++;
        else if (age >= 25 && age <= 34) ageGroups["25-34"]++;
        else if (age >= 35 && age <= 44) ageGroups["35-44"]++;
        else if (age >= 45 && age <= 54) ageGroups["45-54"]++;
        else if (age >= 55 && age <= 64) ageGroups["55-64"]++;
        else if (age >= 65) ageGroups["65+"]++;
      });

      const ageData = Object.entries(ageGroups).map(([range, count]) => ({
        ageRange: range,
        count,
      }));

      res.json(ageData);
    } catch (error) {
      console.error("Error fetching age analytics:", error);
      res.status(500).json({ error: "Failed to fetch age analytics" });
    }
  }
);

// Registration trends (daily for last 30 days)
router.get(
  "/analytics/trends",
  analyticsLimiter,
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const users = await prisma.user.findMany({
        select: {
          createdAt: true,
        },
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      // Group by date
      const dailyStats: { [key: string]: number } = {};

      // Initialize all days with 0
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split("T")[0];
        dailyStats[dateKey] = 0;
      }

      // Count users per day
      users.forEach((user) => {
        const dateKey = user.createdAt.toISOString().split("T")[0];
        if (dailyStats.hasOwnProperty(dateKey)) {
          dailyStats[dateKey]++;
        }
      });

      const trendsData = Object.entries(dailyStats).map(([date, count]) => ({
        date,
        count,
      }));

      res.json(trendsData);
    } catch (error) {
      console.error("Error fetching trends analytics:", error);
      res.status(500).json({ error: "Failed to fetch trends analytics" });
    }
  }
);

// Recent users
router.get(
  "/analytics/recent",
  analyticsLimiter,
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const recentUsers = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          profilePicture: true,
          createdAt: true,
          provider: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      });

      res.json(recentUsers);
    } catch (error) {
      console.error("Error fetching recent users:", error);
      res.status(500).json({ error: "Failed to fetch recent users" });
    }
  }
);
export default router;
