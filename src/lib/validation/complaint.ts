/**
 * Complaint validation — shared by client and server, authoritative on the server.
 *
 * Two distinct contracts live here:
 *
 *  1. `complaintFormSchema` — what a citizen may submit. Deliberately does NOT
 *     accept department, category, priority, status, citizenId or grievanceId.
 *     Those are decided server-side, so a crafted request cannot set them.
 *
 *  2. `classificationOutputSchema` — what the language model is allowed to
 *     return. The department and priority are closed enums, confidence is
 *     range-checked and reasoning is length-capped. Output failing this is
 *     discarded rather than persisted.
 *
 * Error `message` values are stable codes resolved against `errors.<code>` in the
 * active locale, matching the pattern used by registration and login.
 */
import { z } from "zod";

import { DEPARTMENT_IDS } from "@/lib/departments";
import { isValidDistrictFor, isValidStateCode } from "@/lib/locations";
import { evidenceDraftIdsSchema } from "./evidence";
import type { ErrorCode } from "./registration";

const code = (value: ErrorCode): { message: ErrorCode } => ({ message: value });

/* ────────────────────────── controlled vocabularies ────────────────────────── */

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INTAKE_METHODS = ["FORM", "VOICE"] as const;
export type IntakeMethod = (typeof INTAKE_METHODS)[number];

/** `other` is retained rather than coerced, so unexpected input is not mislabelled. */
export const COMPLAINT_LANGUAGES = ["en", "hi", "other"] as const;
export type ComplaintLanguage = (typeof COMPLAINT_LANGUAGES)[number];

export const GRIEVANCE_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

/**
 * Whether routing came from the model or still needs a human.
 * `PENDING_MANUAL_REVIEW` is the honest state when the model is unavailable or
 * returns something invalid — the complaint is kept, the routing is not invented.
 */
export const ROUTING_STATES = ["AI_CLASSIFIED", "PENDING_MANUAL_REVIEW"] as const;
export type RoutingState = (typeof ROUTING_STATES)[number];

/* ────────────────────────── citizen-submitted payload ────────────────────────── */

const title = z
  .string()
  .trim()
  .min(5, code("complaint_title_invalid"))
  .max(150, code("complaint_title_invalid"));

const description = z
  .string()
  .trim()
  .min(20, code("complaint_description_invalid"))
  .max(5000, code("complaint_description_invalid"));

const address = z
  .string()
  .trim()
  .min(3, code("complaint_address_invalid"))
  .max(300, code("complaint_address_invalid"));

const state = z.string().trim().refine(isValidStateCode, code("state_invalid"));

const district = z
  .string()
  .trim()
  .min(1, code("district_invalid"))
  .max(100, code("district_invalid"));

const pincode = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .refine((value) => value === undefined || /^[1-9]\d{5}$/.test(value), code("pincode_invalid"))
  .optional();

/**
 * Coordinates are optional and only ever come from the browser Geolocation API
 * after an explicit citizen action. They are never derived, guessed or defaulted;
 * absent means absent.
 */
const coordinates = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMetres: z.number().nonnegative().optional(),
  })
  .optional();

export const complaintFormSchema = z
  .object({
    intakeMethod: z.enum(INTAKE_METHODS),
    title,
    description,
    address,
    state,
    district,
    pincode,
    coordinates,
    /** Present only for VOICE intake; ties the submission to a server-held draft. */
    voiceDraftId: z.string().trim().max(64).optional(),
    /**
     * Server-held evidence drafts to attach. Only ids cross the wire — the image
     * metadata is re-read from MongoDB and ownership re-checked at submit time, so
     * a caller cannot claim an upload made by someone else.
     */
    evidenceDraftIds: evidenceDraftIdsSchema,
    /**
     * Set when the citizen was shown a possible-duplicate warning and chose to
     * file anyway. Recorded for audit; it never changes whether the complaint is
     * accepted, because a suspicion must not block a submission.
     */
    duplicateAcknowledged: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!isValidDistrictFor(value.state, value.district)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["district"],
        message: "district_state_mismatch" satisfies ErrorCode,
      });
    }
    if (value.intakeMethod === "VOICE" && (value.voiceDraftId ?? "") === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["voiceDraftId"],
        message: "voice_draft_missing" satisfies ErrorCode,
      });
    }
  });

export type ComplaintFormInput = z.infer<typeof complaintFormSchema>;

/** Raw shape the React form binds to before normalisation. */
export interface ComplaintFormValues {
  title: string;
  description: string;
  address: string;
  state: string;
  district: string;
  pincode: string;
}

/* ────────────────────────── model output contract ────────────────────────── */

/**
 * Strict contract for the classifier.
 *
 * `department` and `priority` are the closed enums above, so an invented
 * department fails parsing. `confidence` must be a real 0–1 number. `reasoning`
 * is capped so a verbose model cannot bloat the stored record.
 */
export const classificationOutputSchema = z.object({
  department: z.enum(DEPARTMENT_IDS),
  category: z.string().trim().min(2).max(120),
  priority: z.enum(PRIORITIES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().trim().min(10).max(1200),
  detectedLanguage: z.enum(COMPLAINT_LANGUAGES),
  /**
   * English rendering used for classification and future duplicate detection.
   * The citizen's original wording is stored separately and never replaced.
   */
  normalizedText: z.string().trim().min(10).max(6000),
});

export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;

/** JSON Schema mirror sent to Groq as `response_format.json_schema`. */
export const CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    department: { type: "string", enum: [...DEPARTMENT_IDS] },
    category: { type: "string" },
    priority: { type: "string", enum: [...PRIORITIES] },
    confidence: { type: "number" },
    reasoning: { type: "string" },
    detectedLanguage: { type: "string", enum: [...COMPLAINT_LANGUAGES] },
    normalizedText: { type: "string" },
  },
  required: [
    "department",
    "category",
    "priority",
    "confidence",
    "reasoning",
    "detectedLanguage",
    "normalizedText",
  ],
  additionalProperties: false,
} as const;

/** Human-facing priority label key, resolved through i18n. */
export function priorityLabelKey(priority: Priority): string {
  return `priority.${priority.toLowerCase()}`;
}
