import mongoose from "mongoose";

export interface IAuditLog extends mongoose.Document {
    admin?: mongoose.Types.ObjectId;
    action: "login_success" | "login_failed" | "logout";
    ipAddress: string;
    userAgent: string;
    createdAt: Date;
    updatedAt: Date;
}

const auditLogSchema = new mongoose.Schema<IAuditLog>(
    {
        admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        action: { type: String, enum: ["login_success", "login_failed", "logout"], required: true },
        ipAddress: { type: String, required: true },
        userAgent: { type: String, required: true },
    },
    { timestamps: true }
);

const AuditLog = mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
export default AuditLog;
