import mongoose from "mongoose";

export interface IRoutingRule extends mongoose.Document {
    department: mongoose.Types.ObjectId;
    subCategory: string;
    keywords: string[];
    severityHint: "P1" | "P2" | "P3";
    isActive: boolean;
}

const routingRuleSchema = new mongoose.Schema<IRoutingRule>(
    {
        department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
        subCategory: { type: String, required: true },
        keywords: [{ type: String, required: true, lowercase: true, trim: true }],
        severityHint: { type: String, enum: ["P1", "P2", "P3"], required: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

const RoutingRule = mongoose.models.RoutingRule || mongoose.model<IRoutingRule>("RoutingRule", routingRuleSchema);
export default RoutingRule;
