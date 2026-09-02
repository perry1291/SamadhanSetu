import { Router } from "express";
import Grievance from "../models/Grievance";
import { classifyAndRoute } from "../services/classification.service";
import mongoose from "mongoose";

const router = Router();

// Open endpoint for citizens to submit grievances directly into the inference engine
router.post("/", async (req, res) => {
    try {
        const { title, description, language, location } = req.body;

        if (!title || !description) {
            return res.status(400).json({ error: "Title and description are required" });
        }

        const g = await Grievance.create({
            rawText: `${title}\n---\n${description}`,
            language: language || "en",
            status: "new",
            location: location || { district: "AssessedDistrict" }
        });

        // The exact moment it is created, dispatch the intelligent routing pipeline
        const finalRouting = await classifyAndRoute(g._id as mongoose.Types.ObjectId);

        return res.status(201).json({
            ok: true,
            grievance: finalRouting
        });

    } catch (err) {
        console.error("Ingress engine failed:", err);
        return res.status(500).json({ error: "System fault generating grievance" });
    }
});

export default router;
