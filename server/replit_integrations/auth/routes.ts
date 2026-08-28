import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../../db";
import { passwordResetTokens } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

const registerSchema = z.object({
  email: z.string().email("Invalid email address").transform(e => e.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required").transform(s => s.trim()),
  lastName: z.string().min(1, "Last name is required").transform(s => s.trim()),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address").transform(e => e.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

function regenerateSession(req: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const oldSession = { ...req.session };
    req.session.regenerate((err: any) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function saveSession(req: any): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err: any) => (err ? reject(err) : resolve()));
  });
}

async function linkInvitations(email: string, userId: string) {
  const invitedMembers = await storage.getInvitedMembersByEmail(email);
  for (const invite of invitedMembers) {
    await storage.linkInvitedMember(invite.tenantId, email, userId);
  }
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", async (req: any, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { email, password, firstName, lastName } = parsed.data;

      const existing = await authStorage.getUserByEmail(email);
      if (existing?.passwordHash) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      let user;
      if (existing) {
        user = await authStorage.setPassword(existing.id, passwordHash, firstName, lastName);
      } else {
        user = await authStorage.upsertUser({
          email,
          passwordHash,
          firstName,
          lastName,
        });
      }

      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      await saveSession(req);

      await linkInvitations(email, user.id);

      return res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { email, password } = parsed.data;

      const user = await authStorage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      await saveSession(req);

      await linkInvitations(email, user.id);

      return res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ message: "Logged out" });
    });
  });

  app.post("/api/auth/forgot-password", async (req: any, res) => {
    try {
      const { email } = z.object({ email: z.string().email().transform(e => e.toLowerCase().trim()) }).parse(req.body);
      const user = await authStorage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: "If an account with that email exists, a reset link has been generated." });
      }

      await db.update(passwordResetTokens)
        .set({ used: true })
        .where(and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.used, false)));

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      console.log(`[Password Reset] Token generated for ${email}: /reset-password?token=${token}`);

      return res.json({
        message: "If an account with that email exists, a reset link has been generated.",
        resetToken: token,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
      console.error("Forgot password error:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/auth/reset-password", async (req: any, res) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1, "Token is required"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);

      const [resetRecord] = await db.select()
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.token, token),
          eq(passwordResetTokens.used, false),
          gt(passwordResetTokens.expiresAt, new Date()),
        ));

      if (!resetRecord) {
        return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await authStorage.setPassword(resetRecord.userId, passwordHash);

      await db.update(passwordResetTokens)
        .set({ used: true })
        .where(eq(passwordResetTokens.id, resetRecord.id));

      return res.json({ message: "Your password has been reset successfully. You can now log in." });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Reset password error:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.email) {
        await linkInvitations(user.email, userId);
      }

      return res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
