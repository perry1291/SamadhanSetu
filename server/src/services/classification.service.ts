import mongoose from "mongoose";
import Grievance, { IGrievance } from "../models/Grievance";
import RoutingRule from "../models/RoutingRule";
import Admin from "../models/Admin";

export async function classifyAndRoute(grievanceId: mongoose.Types.ObjectId) {
    const grievance = await Grievance.findById(grievanceId);
    if (!grievance) throw new Error("Grievance not found");

    const rawText = grievance.rawText.toLowerCase();

    // 1. Fetch active rules
    const rules = await RoutingRule.find({ isActive: true });

    let bestMatch: any = null;

    // 2. Keyword matching
    for (const rule of rules) {
        const hitsKeyword = rule.keywords.some((kw: string) => rawText.includes(kw.toLowerCase()));

        if (hitsKeyword) {
            if (!bestMatch) {
                bestMatch = rule;
            } else {
                // Prefer higher severity: P1 > P2 > P3
                const isHigherSeverity = (prev: "P1" | "P2" | "P3", next: "P1" | "P2" | "P3") => {
                    const ranks = { P1: 3, P2: 2, P3: 1 };
                    return ranks[next] > ranks[prev];
                };
                if (isHigherSeverity(bestMatch.severityHint, rule.severityHint)) {
                    bestMatch = rule;
                }
            }
        }
    }

    const now = new Date();

    // 3 & 4. Setup routing meta
    if (!bestMatch) {
        // Unrouted fallback
        grievance.department = undefined;
        grievance.severity = "P3";
        grievance.routingMeta = { wasFallback: true, matchedAt: now };
        grievance.status = "new";
        await grievance.save();
        return grievance;
    }

    grievance.department = bestMatch.department;
    grievance.subCategory = bestMatch.subCategory;
    grievance.severity = bestMatch.severityHint;
    grievance.routingMeta = { matchedRule: bestMatch._id, wasFallback: false, matchedAt: now };

    // 5. Select officer assignment
    // Candidates: active nodal_officers in the matched department
    const officerCandidates = await Admin.find({
        department: bestMatch.department,
        role: "nodal_officer",
        isActive: true,
    }).sort({ currentOpenCount: 1 }); // ASC: least loaded first

    let assignedAdmin: any = null;

    if (officerCandidates.length > 0) {
        // Exclude anyone at maxCapacity unless EVERYONE is at maximum
        const available = officerCandidates.filter((adm) => adm.currentOpenCount < adm.maxCapacity);
        if (available.length > 0) {
            assignedAdmin = available[0];
        } else {
            assignedAdmin = officerCandidates[0]; // everyone at cap, just pick lowest anyway
        }
    } else {
        // 6. No nodal_officer found, fallback to department_admin
        const deptAdmins = await Admin.find({
            department: bestMatch.department,
            role: "department_admin",
            isActive: true,
        }).sort({ currentOpenCount: 1 });

        if (deptAdmins.length > 0) {
            assignedAdmin = deptAdmins[0];
        }
    }

    if (assignedAdmin) {
        grievance.assignedTo = assignedAdmin._id;
        grievance.status = "assigned";

        // Atomically increment officer count
        await Admin.findByIdAndUpdate(assignedAdmin._id, { $inc: { currentOpenCount: 1 } });
    } else {
        grievance.status = "new"; // Could not auto-assign to any user
    }

    await grievance.save();
    return grievance;
}
