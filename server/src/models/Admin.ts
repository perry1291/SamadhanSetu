import mongoose from "mongoose";

export interface IAdmin extends mongoose.Document {
    fullName: string;
    email: string;
    passwordHash: string;
    role: "super_admin" | "department_admin" | "nodal_officer";
    department?: mongoose.Types.ObjectId;
    phone?: string;
    designation?: string;
    isActive: boolean;
    currentOpenCount: number;
    maxCapacity: number;
    failedLoginAttempts: number;
    lockedUntil?: Date;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const adminSchema = new mongoose.Schema<IAdmin>(
    {
        fullName: { type: String, required: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true, select: false },
        role: { type: String, enum: ["super_admin", "department_admin", "nodal_officer"], required: true },
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            required: function (this: IAdmin) {
                return this.role !== "super_admin";
            },
        },
        phone: { type: String },
        designation: { type: String },
        isActive: { type: Boolean, default: true },
        currentOpenCount: { type: Number, default: 0 },
        maxCapacity: { type: Number, default: 25 },
        failedLoginAttempts: { type: Number, default: 0 },
        lockedUntil: { type: Date },
        lastLoginAt: { type: Date },
    },
    { timestamps: true }
);

// Compound index for department and role lookups during routing
adminSchema.index({ department: 1, role: 1, isActive: 1 });

const Admin = mongoose.models.Admin || mongoose.model<IAdmin>("Admin", adminSchema);
export default Admin;
