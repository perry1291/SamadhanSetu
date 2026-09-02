import mongoose from "mongoose";

export interface IGrievance extends mongoose.Document {
    rawText: string;
    language: "en" | "mr";
    department?: mongoose.Types.ObjectId;
    subCategory?: string;
    severity?: "P1" | "P2" | "P3";
    location?: {
        state?: string;
        district?: string;
        block?: string;
        ward?: string;
    };
    status: "new" | "assigned" | "in_progress" | "resolved" | "closed";
    assignedTo?: mongoose.Types.ObjectId;
    routingMeta?: {
        matchedRule?: mongoose.Types.ObjectId;
        wasFallback?: boolean;
        matchedAt?: Date;
    };
    citizenId?: string; // Reference to citizens collection _id
    imageUrl?: string;  // Placeholder for image
    createdAt: Date;
    updatedAt: Date;
}

const grievanceSchema = new mongoose.Schema<IGrievance>(
    {
        rawText: { type: String, required: true },
        language: { type: String, enum: ["en", "mr"], default: "en" },
        department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
        subCategory: { type: String },
        severity: { type: String, enum: ["P1", "P2", "P3"] },
        location: {
            state: String,
            district: String,
            block: String,
            ward: String,
        },
        status: {
            type: String,
            enum: ["new", "assigned", "in_progress", "resolved", "closed"],
            default: "new",
        },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        routingMeta: {
            matchedRule: { type: mongoose.Schema.Types.ObjectId, ref: "RoutingRule" },
            wasFallback: { type: Boolean },
            matchedAt: { type: Date },
        },
        citizenId: { type: String },
        imageUrl: { type: String },
    },
    { timestamps: true }
);

const Grievance = mongoose.models.Grievance || mongoose.model<IGrievance>("Grievance", grievanceSchema);
export default Grievance;
