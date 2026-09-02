import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { connectDB } from "../db";

import Department from "../models/Department";
import RoutingRule from "../models/RoutingRule";
import Admin from "../models/Admin";
import Grievance from "../models/Grievance";
import { classifyAndRoute } from "../services/classification.service";

const BCRYPT_ROUNDS = 12;

async function seed() {
    await connectDB();
    console.log("\n[seed] ── Starting Roads & Transport Test Slice Seed ──");

    // 1. Department
    const dept = await Department.findOneAndUpdate(
        { code: "ROADS" },
        { $set: { name: "Roads & Transport", isActive: true } },
        { upsert: true, new: true, runValidators: true }
    );
    console.log(`[seed] ✔ Department: ${dept.name} [${dept.code}]`);

    // 2. Admin
    const adminEmail = "admin.roads@gov.test";
    let admin = await Admin.findOne({ email: adminEmail });
    if (!admin) {
        const hash = await bcrypt.hash("Admin@1234", BCRYPT_ROUNDS);
        admin = await Admin.create({
            fullName: "Roads Dept Admin",
            email: adminEmail,
            passwordHash: hash,
            role: "department_admin",
            department: dept._id,
            isActive: true,
            currentOpenCount: 0,
        });
        console.log(`[seed] ✔ Admin: ${adminEmail} created`);
    } else {
        // Reset lockout state if it was locked in a previous run
        admin.failedLoginAttempts = 0;
        admin.lockedUntil = undefined;
        await admin.save();
        console.log(`[seed] ── Admin already exists: ${adminEmail} (reset lock state)`);
    }

    // 2b. Nodal Officer
    const officerEmail = "officer.roads@gov.test";
    let officer = await Admin.findOne({ email: officerEmail });
    if (!officer) {
        const hash = await bcrypt.hash("Officer@1234", BCRYPT_ROUNDS);
        officer = await Admin.create({
            fullName: "Roads Nodal Officer",
            email: officerEmail,
            passwordHash: hash,
            role: "nodal_officer",
            department: dept._id,
            isActive: true,
            currentOpenCount: 0,
        });
        console.log(`[seed] ✔ Nodal Officer: ${officerEmail} created`);
    } else {
        officer.failedLoginAttempts = 0;
        officer.lockedUntil = undefined;
        await officer.save();
        console.log(`[seed] ── Nodal Officer already exists: ${officerEmail} (reset lock state)`);
    }

    // 3. Routing Rules
    const rules = [
        { subCategory: "Road damage", keywords: ["road damage", "pothole", "रस्ते दुरुस्ती", "खड्डे"], severityHint: "P2" },
        { subCategory: "Traffic signal", keywords: ["traffic signal", "signal not working", "ट्रॅफिक"], severityHint: "P2" },
        { subCategory: "Accident / safety", keywords: ["accident", "अपघात"], severityHint: "P1" },
        { subCategory: "Bus routes", keywords: ["bus route", "bus service", "bus stop"], severityHint: "P3" },
    ] as const;

    for (const rule of rules) {
        await RoutingRule.findOneAndUpdate(
            { department: dept._id, subCategory: rule.subCategory },
            { $set: { keywords: rule.keywords, severityHint: rule.severityHint, isActive: true } },
            { upsert: true, new: true }
        );
        console.log(`[seed] ✔ Rule: ${rule.subCategory} [${rule.severityHint}]`);
    }

    // --- FINANCE SCALING ---
    const finDept = await Department.findOneAndUpdate(
        { code: "FIN" }, { $set: { name: "Finance & Revenue", isActive: true } }, { upsert: true, new: true, runValidators: true }
    );
    const faHash = await bcrypt.hash("Admin@1234", BCRYPT_ROUNDS);
    const foHash = await bcrypt.hash("Officer@1234", BCRYPT_ROUNDS);
    await Admin.findOneAndUpdate({ email: "admin.finance@gov.test" }, { $set: { fullName: "Finance Admin", passwordHash: faHash, role: "department_admin", department: finDept._id, isActive: true } }, { upsert: true });
    await Admin.findOneAndUpdate({ email: "officer.finance@gov.test" }, { $set: { fullName: "Finance Officer", passwordHash: foHash, role: "nodal_officer", department: finDept._id, isActive: true } }, { upsert: true });
    const finRules = [
        { subCategory: "Corruption / Bribe", keywords: ["bribe", "lanch", "corruption", "extortion", "लाच"], severityHint: "P1" },
        { subCategory: "Pension Issue", keywords: ["pension", "salary", "pay", "pf"], severityHint: "P2" },
        { subCategory: "Taxation", keywords: ["tax", "revenue", "challan"], severityHint: "P3" },
    ];
    for (const rule of finRules) {
        await RoutingRule.findOneAndUpdate(
            { department: finDept._id, subCategory: rule.subCategory }, { $set: { keywords: rule.keywords, severityHint: rule.severityHint, isActive: true } }, { upsert: true }
        );
    }

    // 3b. Dummy Citizen
    const citizenMobile = "9876543210";
    let dummyCitizen = await mongoose.connection.db!.collection("citizens").findOne({ mobile: citizenMobile });
    if (!dummyCitizen) {
        const result = await mongoose.connection.db!.collection("citizens").insertOne({
            fullName: "Ramesh Kumar",
            mobile: citizenMobile,
            role: "CITIZEN",
            active: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        dummyCitizen = { _id: result.insertedId };
        console.log(`[seed] ✔ Dummy Citizen: Ramesh Kumar created`);
    }

    // 4. Sample Grievances (Wait for routing classification to run)
    await Grievance.deleteMany({}); // Start fresh for grievances

    const samples = [
        { rawText: "Terrible accident on the main highway, please send help", language: "en" }, // -> P1 (accident)
        { rawText: "खड्डे everywhere in my street", language: "mr" }, // -> P2 (pothole/खड्डे)
        { rawText: "Bus schedule is always late at the bus stop", language: "en" }, // -> P3 (bus stop)
        { rawText: "Completely unrelated gibberish about my water bill", language: "en" } // -> Unrouted P3 fallback
    ] as const;

    console.log("\n[seed] ── Processing Sample Grievances ──");
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const g = await Grievance.create({
            rawText: s.rawText,
            language: s.language,
            location: { district: "Thane", state: "Maharashtra" },
            status: "new",
            citizenId: dummyCitizen._id.toString()
        });
        const routed = await classifyAndRoute(g._id as mongoose.Types.ObjectId);
        console.log(`[seed] Grievance ${i + 1}:`);
        console.log(`   Text: "${routed.rawText}"`);
        console.log(`   --> Dept: ${routed.department ? "Matched" : "Unrouted Fallback"}`);
        console.log(`   --> SubCat: ${routed.subCategory || "N/A"}`);
        console.log(`   --> Severity: ${routed.severity}`);
        console.log(`   --> Assigned: ${routed.assignedTo ? "Yes" : "No"}`);
    }

    // Single super_admin for unrouted observation testing
    const saEmail = "super@gov.test";
    let sa = await Admin.findOne({ email: saEmail });
    if (!sa) {
        const hash = await bcrypt.hash("Super@1234", BCRYPT_ROUNDS);
        await Admin.create({
            fullName: "Super Admin",
            email: saEmail,
            passwordHash: hash,
            role: "super_admin",
            isActive: true,
            currentOpenCount: 0,
        });
    }

    console.log("\n[seed] ── Done! ──\n");
    await mongoose.disconnect();
}

seed().catch((err) => {
    console.error("Seed error:", err);
    mongoose.disconnect().catch(() => { });
    process.exit(1);
});
