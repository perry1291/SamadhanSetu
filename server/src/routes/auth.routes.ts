import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import Admin from "../models/Admin";
import AuditLog from "../models/AuditLog";
import { requireAuth } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 10 : 200,
    message: { error: "Too many requests, please try again later.", code: "RATE_LIMITED" },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post("/login", authRateLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

        const admin = await Admin.findOne({ email }).select("+passwordHash");
        if (!admin) {
            // Don't leak existence, create anonymous audit log
            await AuditLog.create({ action: "login_failed", ipAddress: req.ip || "unknown", userAgent: req.headers["user-agent"] || "unknown" });
            return res.status(401).json({ error: "Invalid credentials" });
        }

        if (admin.lockedUntil && admin.lockedUntil > new Date()) {
            return res.status(423).json({
                error: "Account locked due to multiple failed attempts",
                lockedUntil: admin.lockedUntil,
            });
        }

        const isValid = await bcrypt.compare(password, admin.passwordHash);

        if (!isValid) {
            admin.failedLoginAttempts += 1;
            if (admin.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
                const lockoutTime = new Date();
                lockoutTime.setMinutes(lockoutTime.getMinutes() + LOCKOUT_MINUTES);
                admin.lockedUntil = lockoutTime;
            }
            await admin.save();
            await AuditLog.create({ admin: admin._id, action: "login_failed", ipAddress: req.ip || "unknown", userAgent: req.headers["user-agent"] || "unknown" });

            if (admin.lockedUntil) {
                return res.status(423).json({ error: "Account locked", lockedUntil: admin.lockedUntil });
            }
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Success
        admin.failedLoginAttempts = 0;
        admin.lockedUntil = undefined;
        admin.lastLoginAt = new Date();
        await admin.save();

        await AuditLog.create({ admin: admin._id, action: "login_success", ipAddress: req.ip || "unknown", userAgent: req.headers["user-agent"] || "unknown" });

        const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "8h" });
        res.cookie("jwt", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 8 * 60 * 60 * 1000,
        });

        // Strip passwordHash from response explicitly
        const { passwordHash, ...profile } = admin.toObject();
        return res.status(200).json({ admin: profile });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/logout", (req, res) => {
    res.clearCookie("jwt", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" });
    // Audit log best effort async
    jwt.verify(req.cookies.jwt, JWT_SECRET, (err: any, decoded: any) => {
        if (!err && decoded) {
            AuditLog.create({ admin: decoded.id, action: "logout", ipAddress: req.ip || "unknown", userAgent: req.headers["user-agent"] || "unknown" }).catch(() => { });
        }
    });
    return res.status(200).json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth, (req, res) => {
    return res.status(200).json({ admin: req.admin });
});

export default router;
