import { Router } from "express";
import Grievance from "../models/Grievance";
import { requireAuth, scopeToDepartment } from "../middleware/auth";

const router = Router();

// /api/admin/* endpoints
router.use(requireAuth);

router.get("/me/queue", scopeToDepartment, async (req, res) => {
    try {
        const filter: any = { ...req.departmentFilter };

        // For nodal officers, enforce assignedTo
        if (req.admin!.role === "nodal_officer") {
            filter.assignedTo = req.admin!._id;
        }

        if (req.query.status) {
            filter.status = req.query.status;
        }

        const grievances = await Grievance.find(filter)
            .sort({ severity: 1, createdAt: 1 }) // "P1" comes before "P2", "P3", then newest
            .lean();

        // Fetch citizen details manually
        const citizenIds = grievances.map(g => g.citizenId).filter(Boolean);
        const mongoose = require("mongoose");
        const objectIds = citizenIds.map(id => {
            try { return new mongoose.Types.ObjectId(id); } catch (e) { return null; }
        }).filter(Boolean);

        const citizens = await mongoose.connection.db!.collection("citizens").find({ _id: { $in: objectIds } }).toArray();
        const citizenMap = new Map();
        citizens.forEach((c: any) => citizenMap.set(c._id.toString(), c));

        // Attach citizen to grievances
        const populatedGrievances = grievances.map(g => {
            if (g.citizenId && citizenMap.has(g.citizenId)) {
                return { ...g, citizen: citizenMap.get(g.citizenId) };
            }
            return g;
        });

        return res.status(200).json({ grievances: populatedGrievances });
    } catch (error) {
        console.error("Queue query error:", error);
        return res.status(500).json({ error: "Failed to fetch queue" });
    }
});

router.get("/me/summary", scopeToDepartment, async (req, res) => {
    try {
        const filter: any = { ...req.departmentFilter };
        if (req.admin!.role === "nodal_officer") {
            filter.assignedTo = req.admin!._id;
        }

        const grievances = await Grievance.find(filter).select("severity status assignedTo");

        const summary = {
            P1: 0,
            P2: 0,
            P3: 0,
            total: grievances.length,
            unassigned: 0,
        };

        grievances.forEach((g) => {
            if (g.severity === "P1") summary.P1++;
            if (g.severity === "P2") summary.P2++;
            if (g.severity === "P3") summary.P3++;
            if (!g.assignedTo) summary.unassigned++;
        });

        return res.status(200).json({ summary });
    } catch (error) {
        console.error("Summary error:", error);
        return res.status(500).json({ error: "Failed to fetch summary" });
    }
});

// A temporary unrouted endpoint for super_admin observation
router.get("/unrouted", scopeToDepartment, async (req, res) => {
    if (req.admin!.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
    try {
        const grievances = await Grievance.find({ department: { $exists: false } }).sort({ createdAt: -1 });
        return res.status(200).json({ grievances });
    } catch (error) {
        console.error("Unrouted error:", error);
        return res.status(500).json({ error: "Failed to fetch unrouted" });
    }
});

export default router;
