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

export default router;
