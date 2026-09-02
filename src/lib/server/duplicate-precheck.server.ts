/**
 * Authenticated entry point for the pre-submission duplicate warning.
 *
 * Kept separate from `duplicate.server.ts` so that module stays a pure pipeline
 * and this file owns the two concerns a public entry point needs: proving who is
 * asking, and validating what they sent.
 *
 * ACCESS: requires a CITIZEN session. This matters more than it looks — the check
 * accepts arbitrary text and answers with nearby grievance numbers, so leaving it
 * open would turn it into a corpus probe. Authentication ties every call to a
 * known citizen, and the response is limited to a grievance number, district,
 * date, status and similarity percentage. No name, mobile, email, address or
 * complaint text is ever returned, and the full corpus is never sent.
 *
 * COST: no language model call and no writes, so a citizen typing in the form
 * cannot exhaust the Groq quota or leave records behind.
 */
import "@tanstack/react-start/server-only";

import { z } from "zod";

import { isValidStateCode } from "@/lib/locations";
import type { RelatedComplaint } from "@/lib/validation/duplicate";
import { precheckDuplicates } from "./duplicate.server";
import { requireCitizen } from "./session.server";

/**
 * Accepts only the fields the check needs.
 *
 * Deliberately absent: citizenId, department, priority, status and grievanceId. A
 * caller cannot steer candidate retrieval toward a department, and cannot name a
 * grievance to compare against.
 */
const precheckInputSchema = z.object({
  // Shorter minimums than the submission schema: the citizen is still typing.
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  state: z.string().trim().refine(isValidStateCode),
  district: z.string().trim().min(1).max(100),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/)
    .optional(),
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

/**
 * Returns complaints that may already cover the same problem.
 *
 * Advisory. An empty list is returned for invalid input or any internal failure,
 * because a warning that cannot be produced must never stand between a citizen and
 * filing a grievance.
 */
export async function precheckDuplicateComplaint(
  rawInput: unknown,
): Promise<{ related: RelatedComplaint[] }> {
  try {
    await requireCitizen();

    const parsed = precheckInputSchema.safeParse(rawInput);
    // Silent: this is a hint while typing, not a form the citizen submitted.
    if (!parsed.success) return { related: [] };
    const input = parsed.data;

    return await precheckDuplicates({
      title: input.title,
      // Pre-classification, so there is no English rendering yet. The citizen's own
      // wording is used, which is why the similarity scorer normalises its inputs
      // rather than assuming they are already normalised.
      normalizedText: input.description,
      district: input.district,
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      ...(input.coordinates !== undefined ? { coordinates: input.coordinates } : {}),
    });
  } catch {
    // Includes the unauthenticated case: no detail, no partial data.
    return { related: [] };
  }
}
