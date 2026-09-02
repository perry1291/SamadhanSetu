import mongoose from "mongoose";

// A minimal schema matching the frontend's CitizenDocument from `collections.server.ts`
export interface ICitizen extends mongoose.Document {
    fullName: string;
    mobile: string;
    role: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const citizenSchema = new mongoose.Schema<ICitizen>(
    {
        fullName: { type: String },
        mobile: { type: String, unique: true },
        role: { type: String },
        active: { type: Boolean, default: true },
    },
    { timestamps: true, collection: "citizens" } // Binds to the actual "citizens" collection
);

const Citizen = mongoose.models.Citizen || mongoose.model<ICitizen>("Citizen", citizenSchema);
export default Citizen;
