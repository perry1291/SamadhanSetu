import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import grievanceRoutes from "./routes/grievance.routes";

const app = express();

app.use(helmet());

const ADMIN_ORIGIN = process.env.ADMIN_FRONTEND_ORIGIN || "http://localhost:5173";
app.use(
    cors({
        origin: [ADMIN_ORIGIN, "http://localhost:8080"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routers
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/grievances", grievanceRoutes);

// Health verify
app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404
app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Global error
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server] Unhandled error:", err.name, err.message);
    res.status(500).json({ error: "Internal server error" });
});

export default app;
