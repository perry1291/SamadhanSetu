import mongoose from "mongoose";

export interface IDepartment extends mongoose.Document {
    name: string;
    code: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const departmentSchema = new mongoose.Schema<IDepartment>(
    {
        name: { type: String, required: true, unique: true },
        code: { type: String, required: true, unique: true, uppercase: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

const Department = mongoose.models.Department || mongoose.model<IDepartment>("Department", departmentSchema);
export default Department;
