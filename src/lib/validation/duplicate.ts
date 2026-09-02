/**
 * Duplicate-detection configuration and the adjudicator's output contract.
 *
 * Thresholds are named and justified here rather than scattered as bare numbers,
 * because they are policy decisions a department may want to tune, not
 * implementation details.
 */
import { z } from "zod";

/* ────────────────────────── candidate retrieval ────────────────────────── */

/**
 * Radius for geographic candidate retrieval when both grievances have real
 * coordinates.
 *
 * 750 m is chosen to cover "the same street or junction" in Indian urban density
 * without pulling in a whole ward. Civic issues (a pothole, an overflowing bin, a
 * dark street light) are inherently local; beyond a few hundred metres they are
 * usually genuinely separate problems that each need their own work order.
 */
export const DUPLICATE_GEO_RADIUS_METRES = 750;

/**
 * Time window for candidate retrieval.
 *
 * 30 days balances two failure modes: too short and a citizen re-reporting an
 * unresolved issue looks new; too long and a recurring seasonal problem (monsoon
 * potholes, repeated outages) gets wrongly folded into last quarter's complaint.
 */
export const DUPLICATE_TIME_WINDOW_DAYS = 30;

/**
 * Hard cap on candidates read from MongoDB per analysis. Bounds both query cost
 * and the amount of text considered, independent of corpus growth.
 */
export const MAX_CANDIDATES = 25;

/**
 * Hard cap on adjudication calls per submission.
 *
 * The Groq free tier has already returned HTTP 429 under modest load, so the
 * expensive stage is deliberately limited to the few best candidates rather than
 * scaling with corpus size.
 */
export const MAX_ADJUDICATIONS = 3;

/* ────────────────────────── thresholds ────────────────────────── */

/**
 * Minimum lexical similarity for a candidate to be worth adjudicating.
 *
 * Below this the two texts share little beyond common civic vocabulary
 * ("road", "water", "please"), which department and location filters already
 * account for. Set low deliberately: the cheap score is a funnel, not a verdict,
 * and paraphrases across Hindi and English can score modestly even when the
 * underlying issue is identical.
 */
export const CANDIDATE_SIMILARITY_THRESHOLD = 0.28;

/**
 * Lexical similarity at which a pair is surfaced to the citizen as a possible
 * duplicate even if adjudication could not run.
 */
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.45;

/**
 * Adjudicator confidence required to record HIGH_CONFIDENCE_DUPLICATE.
 *
 * Set high because the consequence is a citizen being told their problem is
 * already known. A false positive risks a real grievance being deprioritised, so
 * the bar for asserting sameness is stricter than the bar for flagging.
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Confidence below which adjudication is treated as "not a duplicate" even when
 * the model answered `isDuplicate: true`. Prevents a hedged yes from becoming an
 * assertion.
 */
export const MIN_DUPLICATE_CONFIDENCE = 0.6;

/* ────────────────────────── adjudicator contract ────────────────────────── */

/**
 * Strict output contract. Three fields only: the model cannot introduce a
 * department, priority, status or any other field that would leak into routing.
 */
export const duplicateAdjudicationSchema = z.object({
  isDuplicate: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().trim().min(10).max(600),
});

export type DuplicateAdjudication = z.infer<typeof duplicateAdjudicationSchema>;

/** JSON Schema mirror sent to Groq as `response_format.json_schema`. */
export const DUPLICATE_JSON_SCHEMA = {
  type: "object",
  properties: {
    isDuplicate: { type: "boolean" },
    confidence: { type: "number" },
    reasoning: { type: "string" },
  },
  required: ["isDuplicate", "confidence", "reasoning"],
  additionalProperties: false,
} as const;

/* ────────────────────────── citizen-facing shape ────────────────────────── */

/**
 * Why a pair was surfaced, as a closed code rather than free text.
 *
 * A code is used instead of a generated sentence for two reasons. It is
 * translatable, so the Hindi warning is written Hindi rather than a machine
 * rendering of English. And it cannot leak: a model-written explanation is
 * derived from the other citizen's complaint text and could repeat a street name
 * or landmark from it, whereas a fixed code carries only the relationship.
 *
 * The adjudicator's own reasoning is still recorded in `duplicate_links` for
 * officer review — it is simply never sent to a browser.
 */
export const DUPLICATE_REASON_CODES = [
  /** Coordinates available on both, within the geographic radius. */
  "NEARBY_SIMILAR",
  /** Same pincode, no usable coordinates. */
  "SAME_PINCODE_SIMILAR",
  /** Same district only, the coarsest match that still qualifies. */
  "SAME_DISTRICT_SIMILAR",
] as const;

export type DuplicateReasonCode = (typeof DUPLICATE_REASON_CODES)[number];

/**
 * The ONLY duplicate information ever sent to a browser.
 *
 * Excludes the other citizen's name, mobile, email, exact address, complaint
 * text, title and internal ids. A grievance number, coarse area, date, status and
 * a relationship code are enough for a citizen to recognise their own earlier
 * report or decide the two issues are different.
 */
export const relatedComplaintSchema = z.object({
  grievanceId: z.string(),
  /** District-level only, never a street address. */
  area: z.string(),
  /** ISO 8601 date. Formatted in the citizen's locale on the client. */
  filedOn: z.string(),
  status: z.string(),
  similarityPercent: z.number().int().min(0).max(100),
  reasonCode: z.enum(DUPLICATE_REASON_CODES),
  /** Rounded to the nearest 50 m, and only when both had coordinates. */
  approxDistanceMetres: z.number().int().nonnegative().optional(),
});

export type RelatedComplaint = z.infer<typeof relatedComplaintSchema>;
