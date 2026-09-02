/**
 * Grievance intake orchestration.
 *
 * Ownership: the citizen id always comes from `requireCitizen()`, i.e. the
 * HttpOnly session cookie. Any `citizenId`, `role`, `department`, `priority`,
 * `status` or `grievanceId` present in the request body is ignored — the
 * validation schema does not accept those fields at all.
 *
 * Original wording: `description` stores exactly what the citizen wrote or
 * confirmed. The model's English rendering is stored additively in
 * `normalizedText`. The citizen's text is never replaced by a rewrite.
 *
 * Truthfulness: if classification is unavailable or invalid the grievance is
 * still saved, with `routing.state = PENDING_MANUAL_REVIEW` and no department,
 * priority or SLA. Nothing is fabricated.
 */
import "@tanstack/react-start/server-only";

import { findDepartment } from "@/lib/departments";
import { districtsOf, findState } from "@/lib/locations";
import {
  complaintFormSchema,
  type ComplaintLanguage,
  type GrievanceStatus,
  type Priority,
  type RoutingState,
} from "@/lib/validation/complaint";
import type { RelatedComplaint } from "@/lib/validation/duplicate";
import { toFieldErrors, type ErrorCode } from "@/lib/validation/registration";
import { recordAuditEvent } from "./audit.server";
import { resolveClassificationProvider } from "./classification.server";
import {
  getCollections,
  isDuplicateKeyError,
  nextSequence,
  type DuplicateStatus,
  type EvidenceRef,
  type GrievanceAiSnapshot,
  type GrievanceDocument,
  type GrievanceLocation,
  type GrievanceRouting,
  type GrievanceVoiceMetadata,
} from "./collections.server";
import { DatabaseUnavailableError } from "./db.server";
import { analyzeDuplicates } from "./duplicate.server";
import { attachEvidenceToGrievance } from "./evidence.server";
import { resolveSpeechProvider, type TranscriptionFailureReason } from "./speech.server";
import { ForbiddenError, requireCitizen, UnauthorizedError } from "./session.server";

/* ────────────────────────── limits ────────────────────────── */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_SECONDS = 240;
const VOICE_DRAFT_TTL_MS = 30 * 60 * 1000;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
]);

/* ────────────────────────── result shapes ────────────────────────── */

export interface ClassificationSummary {
  state: "AI_CLASSIFIED" | "PENDING_MANUAL_REVIEW";
  departmentId?: string;
  departmentName?: string;
  category?: string;
  priority?: Priority;
  confidence?: number;
  reasoning?: string;
}

/**
 * Duplicate outcome as reported to the citizen after submission.
 *
 * Carries the status honestly, including `ANALYSIS_UNAVAILABLE`, so the receipt
 * can say the check could not be completed rather than implying it passed.
 */
export interface DuplicateSummary {
  status: DuplicateStatus;
  related: RelatedComplaint[];
}

export type SubmitComplaintResult =
  | {
      ok: true;
      grievanceId: string;
      status: string;
      filedAt: string;
      slaDueAt?: string;
      classification: ClassificationSummary;
      originalLanguage: ComplaintLanguage;
      /** How many images were stored. Zero when none were attached. */
      evidenceCount: number;
      duplicate: DuplicateSummary;
    }
  | { ok: false; error: ErrorCode; fieldErrors?: Record<string, ErrorCode> };

export type TranscribeResult =
  | {
      ok: true;
      draftId: string;
      transcript: string;
      detectedLanguage: ComplaintLanguage;
      durationSeconds?: number;
    }
  | { ok: false; error: ErrorCode };

/* ────────────────────────── helpers ────────────────────────── */

function mapUnexpectedError(error: unknown, context: string): ErrorCode {
  if (error instanceof UnauthorizedError) return "unauthorized";
  if (error instanceof ForbiddenError) return "forbidden";
  if (error instanceof DatabaseUnavailableError) return "database_unavailable";
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`[grievance] ${context} failed: ${name}`);
  return "server_error";
}

/** SHA-256 hex via WebCrypto, used to reference inputs without storing them. */
async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function transcriptionReasonToErrorCode(reason: TranscriptionFailureReason): ErrorCode {
  switch (reason) {
    case "provider_not_configured":
      return "speech_provider_not_configured";
    case "no_speech_detected":
      return "speech_no_speech_detected";
    case "audio_too_large":
      return "audio_too_large";
    case "audio_unsupported":
      return "audio_unsupported";
    default:
      return "speech_transcription_failed";
  }
}

/** Working-day SLA: skips Saturdays and Sundays, matching Citizen's Charter practice. */
function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

/** `GRV/2026/0000042`. Sequence is allocated atomically. */
async function allocateGrievanceId(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const sequence = await nextSequence(`grievance:${year}`);
  return `GRV/${year}/${String(sequence).padStart(7, "0")}`;
}

/* ────────────────────────── voice transcription ────────────────────────── */

/**
 * Transcribes uploaded audio and parks the result server-side.
 *
 * The transcript is NOT trusted from the client at submit time: it is re-read
 * from this draft, so a caller cannot forge what was said or which model
 * produced it. The citizen may still edit the text, and that edit is recorded
 * separately from the raw transcript.
 */
export async function transcribeVoiceComplaint(input: {
  audio: Uint8Array;
  mimeType: string;
}): Promise<TranscribeResult> {
  try {
    const citizen = await requireCitizen();

    if (input.audio.byteLength === 0) return { ok: false, error: "audio_unsupported" };
    if (input.audio.byteLength > MAX_AUDIO_BYTES) return { ok: false, error: "audio_too_large" };

    // Strip any codec parameters, e.g. `audio/webm;codecs=opus`.
    const baseType = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_AUDIO_TYPES.has(baseType)) return { ok: false, error: "audio_unsupported" };

    const provider = resolveSpeechProvider();
    const result = await provider.transcribe({
      audio: input.audio,
      mimeType: baseType,
      fileName: `complaint.${baseType.split("/")[1] ?? "webm"}`,
    });
    if (!result.ok) return { ok: false, error: transcriptionReasonToErrorCode(result.reason) };

    if (result.durationSeconds !== undefined && result.durationSeconds > MAX_AUDIO_SECONDS) {
      return { ok: false, error: "audio_too_long" };
    }

    const { voiceDrafts } = await getCollections();
    const now = new Date();
    const draftId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    await voiceDrafts.insertOne({
      draftId,
      citizenId: citizen.citizenId,
      transcript: result.transcript,
      detectedLanguage: result.detectedLanguage,
      provider: result.provider,
      model: result.model,
      ...(result.durationSeconds !== undefined ? { durationSeconds: result.durationSeconds } : {}),
      audioSha256: await sha256Hex(input.audio),
      audioBytes: input.audio.byteLength,
      createdAt: now,
      expiresAt: new Date(now.getTime() + VOICE_DRAFT_TTL_MS),
    });

    return {
      ok: true,
      draftId,
      transcript: result.transcript,
      detectedLanguage: result.detectedLanguage,
      ...(result.durationSeconds !== undefined ? { durationSeconds: result.durationSeconds } : {}),
    };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "transcribeVoiceComplaint") };
  }
}

/* ────────────────────────── submission ────────────────────────── */

export async function submitComplaint(rawInput: unknown): Promise<SubmitComplaintResult> {
  try {
    // Authorization first: an anonymous caller never reaches validation or Groq.
    const citizen = await requireCitizen();

    const parsed = complaintFormSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        error: "complaint_invalid",
        fieldErrors: toFieldErrors(parsed.error),
      };
    }
    const input = parsed.data;

    const { grievances, aiDecisions, voiceDrafts } = await getCollections();

    /* ---- voice provenance, read from the server-held draft ---- */
    let voice: GrievanceVoiceMetadata | undefined;
    let draftLanguage: ComplaintLanguage | undefined;
    if (input.intakeMethod === "VOICE") {
      const draft = await voiceDrafts.findOne({ draftId: input.voiceDraftId ?? "" });
      if (draft === null) return { ok: false, error: "voice_draft_missing" };
      // A draft belongs to the citizen who recorded it.
      if (draft.citizenId !== citizen.citizenId) return { ok: false, error: "voice_draft_missing" };
      if (draft.consumedAt !== undefined) return { ok: false, error: "voice_draft_missing" };
      if (draft.expiresAt.getTime() <= Date.now())
        return { ok: false, error: "voice_draft_expired" };

      voice = {
        provider: draft.provider,
        model: draft.model,
        detectedLanguage: draft.detectedLanguage,
        rawTranscript: draft.transcript,
        ...(draft.durationSeconds !== undefined ? { durationSeconds: draft.durationSeconds } : {}),
        editedByCitizen: draft.transcript.trim() !== input.description.trim(),
      };
      draftLanguage = draft.detectedLanguage;
    }

    /* ---- location ---- */
    const stateEntry = findState(input.state);
    const location: GrievanceLocation = {
      address: input.address,
      state: input.state,
      district: input.district,
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      // GeoJSON is [longitude, latitude]. Only present when the citizen shared it.
      ...(input.coordinates !== undefined
        ? {
            geo: {
              type: "Point" as const,
              coordinates: [input.coordinates.longitude, input.coordinates.latitude] as [
                number,
                number,
              ],
            },
            ...(input.coordinates.accuracyMetres !== undefined
              ? { accuracyMetres: input.coordinates.accuracyMetres }
              : {}),
          }
        : {}),
    };

    /* ---- classification ---- */
    const provider = resolveClassificationProvider();
    const classification = await provider.classify({
      title: input.title,
      description: input.description,
      locationHint: `${input.district}, ${stateEntry?.name ?? input.state}${
        input.pincode !== undefined ? ` ${input.pincode}` : ""
      }`,
    });

    const now = new Date();
    let routing: GrievanceRouting;
    let aiSnapshot: GrievanceAiSnapshot | undefined;
    let slaDueAt: Date | undefined;
    let originalLanguage: ComplaintLanguage = draftLanguage ?? "other";
    let normalizedText = input.description;

    if (classification.ok) {
      const output = classification.output;
      const department = findDepartment(output.department);
      // The enum guarantees this, so a miss means the registry changed under us.
      if (department === undefined) {
        routing = {
          state: "PENDING_MANUAL_REVIEW",
          source: "AI",
          unclassifiedReason: "department_not_in_registry",
        };
      } else {
        routing = {
          state: "AI_CLASSIFIED",
          source: "AI",
          departmentId: department.id,
          departmentName: department.name,
          category: output.category,
          priority: output.priority,
          confidence: output.confidence,
          reasoning: output.reasoning,
        };
        aiSnapshot = {
          provider: classification.provider,
          model: classification.model,
          modelVersion: classification.modelVersion,
          departmentId: department.id,
          category: output.category,
          priority: output.priority,
          confidence: output.confidence,
          reasoning: output.reasoning,
          decidedAt: now,
        };
        // SLA comes from the routed department's configuration, never a literal.
        slaDueAt = addWorkingDays(now, department.slaDays);
      }
      // Voice detection wins when present: it observed the actual speech.
      originalLanguage = draftLanguage ?? output.detectedLanguage;
      normalizedText = output.normalizedText;
    } else {
      routing = {
        state: "PENDING_MANUAL_REVIEW",
        source: "AI",
        unclassifiedReason: classification.reason,
      };
    }

    /* ---- persist ---- */
    const grievanceId = await allocateGrievanceId();

    // Evidence is resolved before the insert so the grievance is stored complete,
    // rather than saved and then patched. Drafts are re-read from MongoDB and
    // ownership re-verified there — the request only supplies ids.
    let evidence: EvidenceRef[] = [];
    if (input.evidenceDraftIds !== undefined && input.evidenceDraftIds.length > 0) {
      const attached = await attachEvidenceToGrievance({
        draftIds: input.evidenceDraftIds,
        citizenId: citizen.citizenId,
        grievanceId,
      });
      // Reported rather than silently dropped: the citizen chose to attach a
      // photograph and should know it did not make it, with the form still filled.
      if (!attached.ok) return { ok: false, error: attached.error };
      evidence = attached.evidence;
    }

    const document: GrievanceDocument = {
      grievanceId,
      citizenId: citizen.citizenId,
      title: input.title,
      description: input.description,
      originalLanguage,
      normalizedText,
      intakeMethod: input.intakeMethod,
      ...(voice !== undefined ? { voice } : {}),
      location,
      routing,
      ...(aiSnapshot !== undefined ? { aiSnapshot } : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
      status: "SUBMITTED",
      filedAt: now,
      ...(slaDueAt !== undefined ? { slaDueAt } : {}),
      createdAt: now,
      updatedAt: now,
    };

    try {
      await grievances.insertOne(document);
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) return { ok: false, error: "complaint_submit_failed" };
      throw error;
    }

    if (input.intakeMethod === "VOICE") {
      // Single use, so a draft cannot back two grievances.
      await voiceDrafts.updateOne(
        { draftId: input.voiceDraftId ?? "" },
        { $set: { consumedAt: now } },
      );
    }

    /* ---- explainability records ---- */
    const inputHash = await sha256Hex(normalizedText);
    if (classification.ok && aiSnapshot !== undefined) {
      const output = classification.output;
      const reference = {
        kind: "COMPLAINT_TEXT" as const,
        sha256: inputHash,
        length: normalizedText.length,
        language: originalLanguage,
      };
      // Two records so "why this department?" and "why this priority?" can be
      // answered independently, as required.
      await aiDecisions.insertMany([
        {
          grievanceId,
          decisionType: "CLASSIFICATION",
          provider: classification.provider,
          model: classification.model,
          modelVersion: classification.modelVersion,
          inputReference: reference,
          output: {
            department: output.department,
            category: output.category,
            detectedLanguage: output.detectedLanguage,
          },
          confidence: output.confidence,
          reasoning: output.reasoning,
          attempts: classification.attempts,
          createdAt: now,
        },
        {
          grievanceId,
          decisionType: "PRIORITY",
          provider: classification.provider,
          model: classification.model,
          modelVersion: classification.modelVersion,
          inputReference: reference,
          output: { priority: output.priority },
          confidence: output.confidence,
          reasoning: output.reasoning,
          attempts: classification.attempts,
          createdAt: now,
        },
      ]);
    }

    if (voice !== undefined) {
      await aiDecisions.insertOne({
        grievanceId,
        decisionType: "TRANSCRIPTION",
        provider: voice.provider,
        model: voice.model,
        modelVersion: voice.model,
        inputReference: {
          kind: "AUDIO",
          sha256: await sha256Hex(voice.rawTranscript),
          length: voice.rawTranscript.length,
          language: voice.detectedLanguage,
        },
        output: {
          detectedLanguage: voice.detectedLanguage,
          editedByCitizen: voice.editedByCitizen,
          ...(voice.durationSeconds !== undefined
            ? { durationSeconds: voice.durationSeconds }
            : {}),
        },
        attempts: 1,
        createdAt: now,
      });
    }

    /* ---- audit ---- */
    await recordAuditEvent({
      type: "GRIEVANCE_CREATED",
      actor: { kind: "CITIZEN_SELF", citizenId: citizen.citizenId },
      subject: { kind: "GRIEVANCE", grievanceId, citizenId: citizen.citizenId },
      metadata: {
        intakeMethod: input.intakeMethod,
        originalLanguage,
        routingState: routing.state,
        state: input.state,
        district: input.district,
        hasCoordinates: input.coordinates !== undefined,
        evidenceCount: evidence.length,
        // Recorded because the citizen was warned and chose to proceed, which is
        // their right. It does not affect acceptance.
        duplicateAcknowledged: input.duplicateAcknowledged === true,
      },
    });

    if (classification.ok) {
      const output = classification.output;
      await recordAuditEvent({
        type: "AI_CLASSIFICATION",
        actor: { kind: "SYSTEM" },
        subject: { kind: "GRIEVANCE", grievanceId },
        metadata: {
          provider: classification.provider,
          model: classification.model,
          modelVersion: classification.modelVersion,
          departmentId: output.department,
          category: output.category,
          confidence: output.confidence,
          attempts: classification.attempts,
          inputSha256: inputHash,
        },
      });
      await recordAuditEvent({
        type: "AI_PRIORITY",
        actor: { kind: "SYSTEM" },
        subject: { kind: "GRIEVANCE", grievanceId },
        metadata: {
          provider: classification.provider,
          model: classification.model,
          priority: output.priority,
          confidence: output.confidence,
          inputSha256: inputHash,
        },
      });
    } else {
      await recordAuditEvent({
        type: "AI_CLASSIFICATION",
        actor: { kind: "SYSTEM" },
        subject: { kind: "GRIEVANCE", grievanceId },
        metadata: {
          outcome: "unclassified",
          reason: classification.reason,
          attempts: classification.attempts,
        },
      });
    }

    if (voice !== undefined) {
      await recordAuditEvent({
        type: "AI_TRANSCRIPTION",
        actor: { kind: "SYSTEM" },
        subject: { kind: "GRIEVANCE", grievanceId },
        metadata: {
          provider: voice.provider,
          model: voice.model,
          detectedLanguage: voice.detectedLanguage,
          editedByCitizen: voice.editedByCitizen,
        },
      });
    }

    /* ---- duplicate analysis ---- */
    // Runs only after the complaint is safely stored, and cannot remove it. A
    // suspected duplicate is recorded as a reviewable link; the grievance keeps its
    // own number, routing and SLA either way.
    const duplicateOutcome = await analyzeDuplicates({
      grievanceId,
      citizenId: citizen.citizenId,
      title: input.title,
      normalizedText,
      // Absent when classification failed, in which case candidate retrieval falls
      // back to location and time rather than assuming a department.
      ...(routing.departmentId !== undefined ? { departmentId: routing.departmentId } : {}),
      district: input.district,
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      ...(input.coordinates !== undefined
        ? {
            coordinates: {
              longitude: input.coordinates.longitude,
              latitude: input.coordinates.latitude,
            },
          }
        : {}),
    });

    /* ---- response: no citizen PII beyond what they just typed ---- */
    return {
      ok: true,
      grievanceId,
      status: document.status,
      filedAt: now.toISOString(),
      ...(slaDueAt !== undefined ? { slaDueAt: slaDueAt.toISOString() } : {}),
      originalLanguage,
      evidenceCount: evidence.length,
      duplicate: {
        status: duplicateOutcome.state.status,
        related: duplicateOutcome.related,
      },
      classification: {
        state: routing.state,
        ...(routing.departmentId !== undefined ? { departmentId: routing.departmentId } : {}),
        ...(routing.departmentName !== undefined ? { departmentName: routing.departmentName } : {}),
        ...(routing.category !== undefined ? { category: routing.category } : {}),
        ...(routing.priority !== undefined ? { priority: routing.priority } : {}),
        ...(routing.confidence !== undefined ? { confidence: routing.confidence } : {}),
        ...(routing.reasoning !== undefined ? { reasoning: routing.reasoning } : {}),
      },
    };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "submitComplaint") };
  }
}

/* ────────────────────────── citizen's own complaints ────────────────────────── */

/**
 * One row of the citizen's complaint history.
 *
 * Deliberately narrow: no `citizenId`, no `normalizedText`, no `aiSnapshot` and
 * no voice metadata. Only what the list actually renders crosses the wire.
 * Optional routing fields are absent — not blank, not guessed — when routing is
 * still pending, so the page can say so honestly.
 */
export interface MyComplaintSummary {
  grievanceId: string;
  title: string;
  status: GrievanceStatus;
  /** ISO 8601. Formatted in the citizen's locale on the client. */
  filedAt: string;
  slaDueAt?: string;
  routingState: RoutingState;
  departmentId?: string;
  departmentName?: string;
  category?: string;
  priority?: Priority;
  /** State code as stored, e.g. `MH`. The label is resolved client-side. */
  state: string;
  district: string;
}

export type ListMyComplaintsResult =
  { ok: true; complaints: MyComplaintSummary[] } | { ok: false; error: ErrorCode };

/** Newest first, and capped. A citizen with a long history still gets one page. */
const MY_COMPLAINTS_LIMIT = 200;

/**
 * Lists the complaints owned by the signed-in citizen.
 *
 * Takes no arguments on purpose: the owner comes from `requireCitizen()`, so
 * there is no `citizenId` parameter for a caller to tamper with and no way to
 * read somebody else's history.
 *
 * The `grievanceId` type filter mirrors the partial unique index — this
 * collection also holds documents written by a separate service that has no
 * `grievanceId` field, and those must not surface as blank rows.
 */
export async function listMyComplaints(): Promise<ListMyComplaintsResult> {
  try {
    const citizen = await requireCitizen();
    const { grievances } = await getCollections();

    const documents = await grievances
      .find({ citizenId: citizen.citizenId, grievanceId: { $type: "string" } })
      .sort({ filedAt: -1 })
      .limit(MY_COMPLAINTS_LIMIT)
      .toArray();

    return {
      ok: true,
      complaints: documents.map((document) => ({
        grievanceId: document.grievanceId,
        title: document.title,
        status: document.status,
        filedAt: document.filedAt.toISOString(),
        ...(document.slaDueAt !== undefined ? { slaDueAt: document.slaDueAt.toISOString() } : {}),
        routingState: document.routing.state,
        ...(document.routing.departmentId !== undefined
          ? { departmentId: document.routing.departmentId }
          : {}),
        ...(document.routing.departmentName !== undefined
          ? { departmentName: document.routing.departmentName }
          : {}),
        ...(document.routing.category !== undefined ? { category: document.routing.category } : {}),
        ...(document.routing.priority !== undefined ? { priority: document.routing.priority } : {}),
        state: document.location.state,
        district: document.location.district,
      })),
    };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "listMyComplaints") };
  }
}

/** Districts for the dependent dropdown. Re-exported so the route needs one import. */
export function districtsForState(stateCode: string): readonly string[] {
  return districtsOf(stateCode);
}
