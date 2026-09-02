/**
 * Evidence orchestration: upload, attach, retrieve.
 *
 * AUTHORIZATION MODEL — the important part of this file.
 *
 * Every entry point starts from `requireCitizen()`, so the acting citizen comes
 * from the HttpOnly session cookie and never from a request field. Consequences:
 *
 *  - Upload: the draft is stamped with the session's citizen id.
 *  - Attach: drafts are re-read from MongoDB at submit time and their stored
 *    `citizenId` must equal the session's. A caller who guesses another citizen's
 *    draft id gets `evidence_draft_missing`, so ids are not even a probe oracle.
 *    Drafts are single-use, so one upload cannot back two grievances.
 *  - Retrieve: the grievance is loaded and `citizenId` compared against the
 *    session before any URL is minted. Changing the grievance number in a request
 *    yields the same "not found" answer whether the grievance is absent or owned
 *    by someone else — no existence disclosure.
 *
 * Nothing here returns a Cloudinary public id, asset id or checksum to the
 * browser. The client sees a display name, dimensions and a short-lived signed
 * URL, so a leaked response body does not become durable image access.
 */
import "@tanstack/react-start/server-only";

import {
  EVIDENCE_DRAFT_TTL_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_COMPLAINT,
  ALLOWED_IMAGE_MIME_TYPES,
  type EvidenceSummary,
} from "@/lib/validation/evidence";
import type { ErrorCode } from "@/lib/validation/registration";
import { recordAuditEvent } from "./audit.server";
import {
  CloudinaryUnavailableError,
  deleteEvidenceAsset,
  isCloudinaryConfigured,
  moveEvidenceToGrievance,
  signedEvidenceUrl,
  uploadDraftEvidence,
} from "./cloudinary.server";
import {
  getCollections,
  SAMADHANSETU_GRIEVANCE_FILTER,
  type EvidenceRef,
} from "./collections.server";
import { DatabaseUnavailableError } from "./db.server";
import { safeDisplayName, sanitizeImage, type ImageRejectionReason } from "./image.server";
import { ForbiddenError, requireCitizen, UnauthorizedError } from "./session.server";

/* ────────────────────────── result shapes ────────────────────────── */

export type UploadEvidenceResult =
  { ok: true; draftId: string; evidence: EvidenceSummary } | { ok: false; error: ErrorCode };

export interface EvidenceView extends EvidenceSummary {
  /**
   * Signed Cloudinary delivery URL for an authenticated asset. Issued only after
   * the ownership check below, and bound by signature to this exact asset.
   */
  url: string;
}

export type GetEvidenceResult =
  { ok: true; evidence: EvidenceView[] } | { ok: false; error: ErrorCode };

export type DiscardEvidenceResult = { ok: true } | { ok: false; error: ErrorCode };

/* ────────────────────────── helpers ────────────────────────── */

function mapUnexpectedError(error: unknown, context: string): ErrorCode {
  if (error instanceof UnauthorizedError) return "unauthorized";
  if (error instanceof ForbiddenError) return "forbidden";
  if (error instanceof DatabaseUnavailableError) return "database_unavailable";
  if (error instanceof CloudinaryUnavailableError) {
    return error.reason === "provider_not_configured"
      ? "evidence_provider_not_configured"
      : "evidence_upload_failed";
  }
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`[evidence] ${context} failed: ${name}`);
  return "server_error";
}

function rejectionToErrorCode(reason: ImageRejectionReason): ErrorCode {
  switch (reason) {
    case "not_an_image":
      return "evidence_not_an_image";
    case "unsupported_format":
      return "evidence_unsupported_format";
    case "too_small":
      return "evidence_too_small";
    case "too_many_pixels":
      return "evidence_too_large";
    default:
      return "evidence_corrupt";
  }
}

function randomId(bytes = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Strips storage identifiers, leaving only what the UI needs. */
function toSummary(evidence: EvidenceRef): EvidenceSummary {
  return {
    evidenceId: evidence.evidenceId,
    displayName: evidence.displayName,
    format: evidence.format,
    bytes: evidence.bytes,
    width: evidence.width,
    height: evidence.height,
  };
}

/* ────────────────────────── upload ────────────────────────── */

/**
 * Validates, sanitises and stores one image against a short-lived draft.
 *
 * Runs before the grievance exists, because the grievance number is allocated
 * atomically at submit time. The asset lands in a draft folder and is moved once
 * the number is known.
 *
 * Order of checks is deliberate: authorization, then the cheap byte-length cap,
 * then the expensive decode. An unauthenticated or oversized request never
 * reaches sharp.
 */
export async function uploadEvidenceDraft(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<UploadEvidenceResult> {
  let uploadedPublicId: string | undefined;
  try {
    const citizen = await requireCitizen();

    if (input.bytes.byteLength === 0) return { ok: false, error: "evidence_not_an_image" };
    // Enforced server-side regardless of what the client allowed through.
    if (input.bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "evidence_too_large" };

    // Advisory only. The authoritative check is the byte-level inspection below;
    // this just rejects obviously wrong requests early.
    const declared = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (declared !== "" && !ALLOWED_IMAGE_MIME_TYPES.has(declared)) {
      return { ok: false, error: "evidence_unsupported_format" };
    }

    // Fail before spending CPU on sanitisation when storage is unusable anyway.
    if (!isCloudinaryConfigured()) {
      return { ok: false, error: "evidence_provider_not_configured" };
    }

    const { evidenceDrafts } = await getCollections();
    const now = new Date();

    // Cap outstanding drafts too, so the per-complaint limit cannot be sidestepped
    // by uploading many images and choosing three at submit time.
    const outstanding = await evidenceDrafts.countDocuments({
      citizenId: citizen.citizenId,
      consumedAt: { $exists: false },
      expiresAt: { $gt: now },
    });
    if (outstanding >= MAX_IMAGES_PER_COMPLAINT) {
      return { ok: false, error: "evidence_too_many" };
    }

    // Content decides the type; filename and client MIME are never trusted.
    const sanitized = await sanitizeImage(input.bytes);
    if (!sanitized.ok) return { ok: false, error: rejectionToErrorCode(sanitized.reason) };

    const draftId = randomId();
    const asset = await uploadDraftEvidence({
      bytes: sanitized.bytes,
      format: sanitized.format,
      draftId,
    });
    uploadedPublicId = asset.publicId;

    const evidence: EvidenceRef = {
      evidenceId: randomId(8),
      cloudinaryAssetId: asset.assetId,
      cloudinaryPublicId: asset.publicId,
      cloudinaryType: "authenticated",
      format: sanitized.format,
      bytes: sanitized.byteLength,
      width: sanitized.width,
      height: sanitized.height,
      checksum: sanitized.checksum,
      displayName: safeDisplayName(input.fileName),
      uploadedAt: now,
      uploadedBy: citizen.citizenId,
    };

    await evidenceDrafts.insertOne({
      draftId,
      citizenId: citizen.citizenId,
      evidence,
      createdAt: now,
      expiresAt: new Date(now.getTime() + EVIDENCE_DRAFT_TTL_MS),
    });

    return { ok: true, draftId, evidence: toSummary(evidence) };
  } catch (error: unknown) {
    // Never leave an orphaned asset behind when a later step fails.
    if (uploadedPublicId !== undefined) await deleteEvidenceAsset(uploadedPublicId);
    return { ok: false, error: mapUnexpectedError(error, "uploadEvidenceDraft") };
  }
}

/* ────────────────────────── attach at submit ────────────────────────── */

export type AttachEvidenceOutcome =
  { ok: true; evidence: EvidenceRef[] } | { ok: false; error: ErrorCode };

/**
 * Resolves draft ids into evidence records for a freshly created grievance.
 *
 * Called from the submission path with the citizen id already established by
 * `requireCitizen()`; it is not re-derived here so the caller's single
 * authorization decision governs the whole submission.
 *
 * A failed Cloudinary move is tolerated: the asset stays readable at its draft
 * public id, which is what gets stored. Losing a citizen's evidence to a folder
 * rename would be a worse outcome than an untidy storage layout.
 */
export async function attachEvidenceToGrievance(input: {
  draftIds: readonly string[];
  citizenId: string;
  grievanceId: string;
}): Promise<AttachEvidenceOutcome> {
  if (input.draftIds.length === 0) return { ok: true, evidence: [] };
  if (input.draftIds.length > MAX_IMAGES_PER_COMPLAINT) {
    return { ok: false, error: "evidence_too_many" };
  }

  const { evidenceDrafts } = await getCollections();
  const now = new Date();
  // De-duplicate so the same draft cannot be listed three times.
  const uniqueIds = Array.from(new Set(input.draftIds));

  const attached: EvidenceRef[] = [];
  for (const draftId of uniqueIds) {
    // Ownership is part of the query, not a later comparison, so there is no path
    // that reads another citizen's draft even briefly.
    const draft = await evidenceDrafts.findOne({ draftId, citizenId: input.citizenId });
    if (draft === null) return { ok: false, error: "evidence_draft_missing" };
    if (draft.consumedAt !== undefined) return { ok: false, error: "evidence_draft_missing" };
    if (draft.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, error: "evidence_draft_expired" };
    }

    const movedPublicId = await moveEvidenceToGrievance({
      publicId: draft.evidence.cloudinaryPublicId,
      grievanceId: input.grievanceId,
    });

    attached.push({
      ...draft.evidence,
      ...(movedPublicId !== undefined ? { cloudinaryPublicId: movedPublicId } : {}),
    });
  }

  // Mark consumed only once every draft resolved, so a mid-loop failure does not
  // burn drafts the citizen could otherwise retry with.
  await evidenceDrafts.updateMany(
    { draftId: { $in: uniqueIds }, citizenId: input.citizenId },
    { $set: { consumedAt: now } },
  );

  await recordAuditEvent({
    type: "EVIDENCE_ATTACHED",
    actor: { kind: "CITIZEN_SELF", citizenId: input.citizenId },
    subject: {
      kind: "GRIEVANCE",
      grievanceId: input.grievanceId,
      citizenId: input.citizenId,
    },
    metadata: {
      count: attached.length,
      totalBytes: attached.reduce((sum, item) => sum + item.bytes, 0),
      formats: attached.map((item) => item.format).join(","),
    },
  });

  return { ok: true, evidence: attached };
}

/* ────────────────────────── retrieval ────────────────────────── */

/**
 * Returns short-lived signed URLs for a grievance the caller owns.
 *
 * The ownership check is the only thing standing between a grievance number and
 * its images, so it happens before a single URL is minted. Both "does not exist"
 * and "belongs to another citizen" return `evidence_not_found`, which keeps a
 * citizen from enumerating grievance numbers.
 */
export async function getEvidenceUrls(rawGrievanceId: unknown): Promise<GetEvidenceResult> {
  try {
    const citizen = await requireCitizen();

    if (typeof rawGrievanceId !== "string" || rawGrievanceId.trim() === "") {
      return { ok: false, error: "evidence_not_found" };
    }
    const grievanceId = rawGrievanceId.trim();

    const { grievances } = await getCollections();
    const grievance = await grievances.findOne(
      { ...SAMADHANSETU_GRIEVANCE_FILTER, grievanceId },
      // Read only what the decision needs.
      { projection: { citizenId: 1, evidence: 1, _id: 0 } },
    );

    // Same answer for absent and unauthorized: no existence disclosure.
    if (grievance === null) return { ok: false, error: "evidence_not_found" };
    if (grievance.citizenId !== citizen.citizenId) {
      return { ok: false, error: "evidence_not_found" };
    }

    const items = grievance.evidence ?? [];
    if (items.length === 0) return { ok: true, evidence: [] };

    return {
      ok: true,
      evidence: items.map((item) => ({
        ...toSummary(item),
        url: signedEvidenceUrl({ publicId: item.cloudinaryPublicId, format: item.format }),
      })),
    };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "getEvidenceUrls") };
  }
}

/**
 * Removes an unsubmitted image, for the picker's remove button.
 *
 * Scoped to the session's citizen, so a draft id alone does not let anyone delete
 * someone else's pending upload.
 */
export async function discardEvidenceDraft(rawDraftId: unknown): Promise<DiscardEvidenceResult> {
  try {
    const citizen = await requireCitizen();
    if (typeof rawDraftId !== "string" || rawDraftId.trim() === "") {
      return { ok: false, error: "evidence_draft_missing" };
    }

    const { evidenceDrafts } = await getCollections();
    const draft = await evidenceDrafts.findOne({
      draftId: rawDraftId.trim(),
      citizenId: citizen.citizenId,
    });
    // Idempotent: already gone, or already used by a grievance, is not an error
    // the citizen needs to see.
    if (draft === null) return { ok: true };
    if (draft.consumedAt !== undefined) return { ok: true };

    await deleteEvidenceAsset(draft.evidence.cloudinaryPublicId);
    await evidenceDrafts.deleteOne({ draftId: draft.draftId, citizenId: citizen.citizenId });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "discardEvidenceDraft") };
  }
}
