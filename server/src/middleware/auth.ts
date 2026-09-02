import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Admin, { IAdmin } from "../models/Admin";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}


// Extend express Request definition locally
declare global {
    namespace Express {
        interface Request {
            admin?: IAdmin;
            departmentFilter?: Record<string, any>;
        }
    }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies.jwt;
        if (!token) {
            return res.status(401).json({ error: "Authentication required", code: "NO_TOKEN" });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
        const admin = await Admin.findById(decoded.id);

        if (!admin || !admin.isActive) {
            return res.status(401).json({ error: "Invalid or inactive account", code: "INVALID_ACCOUNT" });
        }

        req.admin = admin;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Authentication failed", code: "AUTH_FAILED" });
    }
};

export const requireRole = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.admin) {
            return res.status(401).json({ error: "Authentication required" });
        }
        if (!roles.includes(req.admin.role)) {
            return res.status(403).json({ error: "Forbidden: insufficient role permissions", code: "FORBIDDEN" });
        }
        next();
    };
};

export const scopeToDepartment = (req: Request, _res: Response, next: NextFunction) => {
    if (req.admin && req.admin.role !== "super_admin" && req.admin.department) {
        req.departmentFilter = { department: req.admin.department };
    } else {
        req.departmentFilter = {};
    }
    next();
};
