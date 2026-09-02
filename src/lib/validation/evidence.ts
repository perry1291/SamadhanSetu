/**
 * Evidence upload limits and shapes — shared by client and server.
 *
 * The client uses these for immediate feedback; the server re-checks every one of
 * them and additionally decodes the image, so a crafted request cannot bypass a
 * limit by lying about size, type or filename.
 */
import { z } from "zod";

import type { ErrorCode } from "./registration";

/** Only raster photo formats a citizen would realistically capture. */
export const ALLOWED_IMAGE_FORMATS = ["jpg", "png"] as const;
export type ImageFormat = (typeof ALLOWED_IMAGE_FORMATS)[number];

/**
 * Client-declared MIME types accepted at the door. Advisory only — the actual
 * format is determined by inspecting the file's bytes.
 */
export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image
export const MAX_IMAGES_PER_COMPLAINT = 3;

/**
 * Upper bound on stored resolution. A 12 MP phone photo carries far more detail
 * than a grievance officer needs, and downscaling both caps storage and removes
 * any residual metadata by forcing a full re-encode.
 */
export const MAX_IMAGE_DIMENSION = 2048;

/** Guards against decompression-bomb images that are small on disk. */
export const MAX_IMAGE_PIXELS = 40_000_000;

/** Minimum useful size; anything smaller is not a legible photograph. */
export const MIN_IMAGE_DIMENSION = 32;

/** How long an uploaded-but-unsubmitted image is retained. */
export const EVIDENCE_DRAFT_TTL_MS = 60 * 60 * 1000;

/**
 * How long a caller should reuse a signed retrieval URL before asking for a new
 * one. This is a client-side caching hint, not a provider-enforced expiry —
 * see `signedEvidenceUrl` for why.
 */
export const EVIDENCE_URL_TTL_SECONDS = 300;

/** Safe subset of evidence metadata returned to the browser. */
export const evidenceSummarySchema = z.object({
  evidenceId: z.string().min(1).max(64),
  displayName: z.string().max(120),
  format: z.enum(ALLOWED_IMAGE_FORMATS),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type EvidenceSummary = z.infer<typeof evidenceSummarySchema>;

/** Draft ids supplied at submission. Bounded so the array cannot be abused. */
export const evidenceDraftIdsSchema = z
  .array(z.string().trim().min(8).max(64))
  .max(MAX_IMAGES_PER_COMPLAINT, { message: "evidence_too_many" satisfies ErrorCode })
  .optional();
