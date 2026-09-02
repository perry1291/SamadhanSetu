/**
 * MongoDB collection accessors, document types and index management.
 *
 * No seed data: collections come into existence when a citizen actually
 * completes registration through the application. Nothing from the legacy mock
 * corpus is imported.
 */
import "@tanstack/react-start/server-only";

import type { Collection, Db, IndexDescription } from "mongodb";

import type { DepartmentId } from "@/lib/departments";
import type { Gender } from "@/lib/validation/registration";
import type {
  ComplaintLanguage,
  GrievanceStatus,
  IntakeMethod,
  Priority,
  RoutingState,
} from "@/lib/validation/complaint";
import { getDb } from "./db.server";

export const COLLECTIONS = {
  citizens: "citizens",
  registrationChallenges: "registration_challenges",
  auditEvents: "audit_events",
  sessions: "sessions",
  loginAttempts: "login_attempts",
  grievances: "grievances",
  aiDecisions: "ai_decisions",
  voiceDrafts: "voice_drafts",
  counters: "counters",
  evidenceDrafts: "evidence_drafts",
  duplicateLinks: "duplicate_links",
} as const;

/** Roles are assigned server-side. A client can never supply this value. */
export type UserRole = "CITIZEN" | "OFFICER" | "SUPERVISOR" | "ADMIN";

export interface CitizenAddress {
  premise: string;
  subLocality?: string;
  locality: string;
  country: string;
  state: string;
  district: string;
  pincode: string;
}

export interface CitizenDocument {
  fullName: string;
  gender: Gender;
  address: CitizenAddress;
  /** Normalised 10-digit mobile. Unique across the collection. Not the _id. */
  mobile: string;
  phone?: string;
  email?: string;
  role: UserRole;
  mobileVerified: boolean;
  /** PBKDF2 encoded MPIN. The plaintext MPIN is never stored. */
  mpinHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pending registration. Holds validated details plus the OTP challenge until the
 * citizen finishes, so no citizen row exists before mobile verification.
 * Removed automatically by the TTL index on `expiresAt`.
 */
export interface RegistrationChallengeDocument {
  challengeId: string;
  mobile: string;
  details: Omit<
    CitizenDocument,
    "role" | "mobileVerified" | "mpinHash" | "active" | "createdAt" | "updatedAt"
  >;
  /** PBKDF2 encoded OTP. Never the code itself. */
  otpHash: string;
  otpExpiresAt: Date;
  attemptsUsed: number;
  resendsUsed: number;
  otpVerified: boolean;
  otpVerifiedAt?: Date;
  /** Set only after OTP success; gates the completion step. */
  verificationTokenHash?: string;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  /** TTL anchor for the whole challenge. */
  expiresAt: Date;
}

export type AuditEventType =
  | "REGISTRATION_STARTED"
  | "OTP_VERIFICATION_SUCCESS"
  | "OTP_VERIFICATION_FAILURE"
  | "REGISTRATION_COMPLETED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "GRIEVANCE_CREATED"
  | "AI_CLASSIFICATION"
  | "AI_PRIORITY"
  | "AI_TRANSCRIPTION"
  | "EVIDENCE_ATTACHED"
  | "DUPLICATE_ANALYSIS"
  | "DUPLICATE_DETECTED"
  | "DUPLICATE_LINKED";

/**
 * Append-only audit record. Metadata deliberately excludes MPIN, MPIN hash, OTP,
 * OTP hash and full PII; the mobile number appears masked only.
 */
export interface AuditEventDocument {
  type: AuditEventType;
  /** Server clock, never a client-supplied timestamp. */
  at: Date;
  actor: { kind: "CITIZEN_SELF" | "SYSTEM"; citizenId?: string };
  subject: {
    kind: "REGISTRATION" | "AUTHENTICATION" | "GRIEVANCE";
    challengeId?: string;
    citizenId?: string;
    sessionId?: string;
    grievanceId?: string;
  };
  metadata: Record<string, string | number | boolean>;
}

/* ────────────────────────── grievances ────────────────────────── */

/** GeoJSON Point, `[longitude, latitude]`. Only stored when real coordinates exist. */
export interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface GrievanceLocation {
  address: string;
  state: string;
  district: string;
  pincode?: string;
  /** Absent unless the citizen explicitly shared their device location. */
  geo?: GeoPoint;
  accuracyMetres?: number;
}

/**
 * Effective routing. Separated from the immutable `aiSnapshot` so a future
 * officer override can rewrite these fields without destroying what the model
 * originally decided. `source` records who decided.
 */
export interface GrievanceRouting {
  state: RoutingState;
  source: "AI" | "OFFICER";
  departmentId?: DepartmentId;
  departmentName?: string;
  category?: string;
  priority?: Priority;
  confidence?: number;
  reasoning?: string;
  /** Set when routing could not be determined, e.g. the model was unavailable. */
  unclassifiedReason?: string;
}

/** Immutable record of the model's original decision. Never overwritten. */
export interface GrievanceAiSnapshot {
  provider: string;
  model: string;
  modelVersion: string;
  departmentId: DepartmentId;
  category: string;
  priority: Priority;
  confidence: number;
  reasoning: string;
  decidedAt: Date;
}

export interface GrievanceVoiceMetadata {
  provider: string;
  model: string;
  detectedLanguage: ComplaintLanguage;
  /** Server-side transcript exactly as returned, before any citizen edit. */
  rawTranscript: string;
  durationSeconds?: number;
  /** True when the citizen amended the transcript before submitting. */
  editedByCitizen: boolean;
}

export interface GrievanceDocument {
  /** Public reference shown to the citizen, e.g. `GRV/2026/0000042`. Unique. */
  grievanceId: string;
  /** Owner. Always taken from the authenticated session, never from a request. */
  citizenId: string;
  title: string;
  /** The citizen's own wording. Never replaced by a model rewrite. */
  description: string;
  originalLanguage: ComplaintLanguage;
  /** English rendering used for classification. Additive, not a replacement. */
  normalizedText: string;
  intakeMethod: IntakeMethod;
  voice?: GrievanceVoiceMetadata;
  location: GrievanceLocation;
  routing: GrievanceRouting;
  aiSnapshot?: GrievanceAiSnapshot;
  /**
   * Sanitised images held in Cloudinary. Optional and additive: grievances filed
   * before this feature simply lack the field.
   */
  evidence?: EvidenceRef[];
  /**
   * Effective duplicate state. Optional and additive. Detail lives in
   * `duplicate_links`; the original AI classification is never touched by it.
   */
  duplicate?: GrievanceDuplicateState;
  status: GrievanceStatus;
  filedAt: Date;
  /** Derived from the routed department's SLA. Absent while unclassified. */
  slaDueAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Explainability record: answers "why this department?" and "why this priority?".
 *
 * `inputReference` identifies the classified text by hash and length rather than
 * duplicating the complaint body, so the audit trail does not multiply copies of
 * citizen PII.
 */
export interface AiDecisionDocument {
  grievanceId: string;
  decisionType: "CLASSIFICATION" | "PRIORITY" | "TRANSCRIPTION" | "DUPLICATE";
  provider: string;
  model: string;
  modelVersion: string;
  inputReference: {
    /** `COMPLAINT_PAIR` references the two texts compared for duplication. */
    kind: "COMPLAINT_TEXT" | "AUDIO" | "COMPLAINT_PAIR";
    sha256: string;
    length: number;
    language?: ComplaintLanguage;
    /** Set for COMPLAINT_PAIR: the other grievance in the comparison. */
    comparedGrievanceId?: string;
  };
  output: Record<string, unknown>;
  confidence?: number;
  reasoning?: string;
  /** Attempts consumed, including retries after invalid output. */
  attempts: number;
  createdAt: Date;
}

/**
 * Short-lived server-held transcription result.
 *
 * The transcript and its provenance are read from here at submit time rather
 * than trusted from the request, so a client cannot forge what was "heard" or
 * which model produced it. Removed by the TTL index.
 */
export interface VoiceDraftDocument {
  draftId: string;
  citizenId: string;
  transcript: string;
  detectedLanguage: ComplaintLanguage;
  provider: string;
  model: string;
  durationSeconds?: number;
  audioSha256: string;
  audioBytes: number;
  createdAt: Date;
  consumedAt?: Date;
  expiresAt: Date;
}

/** Atomic sequence source for human-readable grievance numbers. */
export interface CounterDocument {
  key: string;
  value: number;
}

/* ────────────────────────── evidence ────────────────────────── */

/**
 * Metadata for one sanitised image held in Cloudinary.
 *
 * The image BINARY is never stored in MongoDB — only this reference. The asset is
 * uploaded as Cloudinary `type: "authenticated"`, so the stored ids cannot be
 * turned into a public URL; retrieval requires a server-signed, short-lived URL
 * issued only after an ownership check.
 *
 * Deliberately absent: any EXIF payload, GPS, device identifiers, or the
 * citizen's original filename beyond a display label.
 */
export interface EvidenceRef {
  /** Opaque id used by the client to refer to this item. */
  evidenceId: string;
  cloudinaryAssetId: string;
  cloudinaryPublicId: string;
  /** Cloudinary delivery type. Always "authenticated" for evidence. */
  cloudinaryType: "authenticated";
  format: "jpg" | "png";
  bytes: number;
  width: number;
  height: number;
  /** SHA-256 of the SANITISED bytes actually uploaded, not the original file. */
  checksum: string;
  /** Citizen-supplied label, sanitised. Kept only so the citizen recognises it. */
  displayName: string;
  uploadedAt: Date;
  /** Citizen id from the session at upload time. */
  uploadedBy: string;
}

/**
 * Short-lived record of an image uploaded before the grievance exists.
 *
 * The asset is uploaded to a draft Cloudinary folder and moved into
 * `samadhan-setu/complaints/{grievanceId}/` when the complaint is submitted. The
 * draft is read server-side at submit time so a client cannot claim an asset it
 * did not upload. Removed by the TTL index if the complaint is abandoned.
 */
export interface EvidenceDraftDocument {
  draftId: string;
  citizenId: string;
  evidence: EvidenceRef;
  createdAt: Date;
  consumedAt?: Date;
  expiresAt: Date;
}

/* ────────────────────────── duplicates ────────────────────────── */

export type DuplicateStatus =
  /** Similarity and adjudication agree this is the same issue. */
  | "HIGH_CONFIDENCE_DUPLICATE"
  /** Enough signal to warrant a human look, not enough to assert. */
  | "POSSIBLE_DUPLICATE"
  | "NOT_DUPLICATE"
  /** Provider unavailable, rate-limited or invalid output. Never a guess. */
  | "ANALYSIS_UNAVAILABLE";

export type DuplicateReviewStatus = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED";

/**
 * Directional duplicate relationship between two SamadhanSetu grievances.
 *
 * `primaryGrievanceId` is the earlier complaint; `relatedGrievanceId` is the new
 * one. Nothing here deletes, merges or rewrites either grievance — the link is a
 * reviewable assertion, and both complaints remain intact and independently
 * addressable.
 */
export interface DuplicateLinkDocument {
  duplicateLinkId: string;
  /** The earlier grievance, treated as the canonical one. */
  primaryGrievanceId: string;
  /** The newly filed grievance that resembles it. */
  relatedGrievanceId: string;
  /** Cheap lexical score, 0..1. */
  similarity: number;
  /** Adjudicator confidence, 0..1. Absent when no adjudication ran. */
  confidence?: number;
  rationale: string;
  /** Present only when both grievances carry real coordinates. */
  distanceMetres?: number;
  status: DuplicateStatus;
  reviewStatus: DuplicateReviewStatus;
  /**
   * What produced the verdict.
   *
   * `AI_ADJUDICATION` is the only value written automatically. A link is never
   * created from lexical similarity alone — if adjudication is unavailable the
   * grievance records `ANALYSIS_UNAVAILABLE` and no link is asserted. `OFFICER` is
   * reserved for a human-created link.
   */
  source: "AI_ADJUDICATION" | "OFFICER";
  provider?: string;
  model?: string;
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

/**
 * Summary of duplicate analysis on the grievance itself, for cheap reads.
 *
 * Mirrors the `routing` / `aiSnapshot` split used for classification: this is the
 * effective state and may later be revised by an officer, while the detailed
 * evidence stays immutable in `duplicate_links` and `ai_decisions`.
 */
export interface GrievanceDuplicateState {
  status: DuplicateStatus;
  /** Best candidate found, if any. */
  primaryGrievanceId?: string;
  similarity?: number;
  confidence?: number;
  /** How many candidates passed the cheap filter. */
  candidatesConsidered: number;
  /** Set when status is ANALYSIS_UNAVAILABLE. */
  unavailableReason?: string;
  analysedAt: Date;
  source: "AI" | "OFFICER";
}

/**
 * Authenticated session, stored server-side so logout genuinely revokes access
 * rather than only clearing a client cookie.
 *
 * Selector/verifier split: the cookie carries `<sessionId>.<secret>`. `sessionId`
 * is an indexed non-secret lookup key; only a PBKDF2 hash of `secret` is stored.
 * A database leak therefore yields no usable session cookie, and lookup stays a
 * single indexed query rather than a scan.
 */
export interface SessionDocument {
  sessionId: string;
  /** PBKDF2 hash of the cookie secret. Never the secret itself. */
  secretHash: string;
  citizenId: string;
  /** Snapshotted at login for auditing; authorization always re-reads the citizen. */
  role: UserRole;
  createdAt: Date;
  lastSeenAt: Date;
  /** TTL anchor. Absolute expiry, not extended indefinitely. */
  expiresAt: Date;
  revokedAt?: Date;
}

/**
 * Failed-login tracking for brute-force protection.
 *
 * Keyed by normalised mobile and recorded for unknown numbers too — if only
 * existing accounts were tracked, a lockout response would itself disclose that
 * an account exists.
 */
export interface LoginAttemptDocument {
  key: string;
  failures: number;
  firstFailureAt: Date;
  lockedUntil?: Date;
  updatedAt: Date;
  /** TTL anchor so stale counters clear themselves. */
  expiresAt: Date;
}

const INDEXES: Record<string, IndexDescription[]> = {
  [COLLECTIONS.citizens]: [
    // The final protection against duplicate accounts. Concurrent requests that
    // pass the pre-check still collide here with error 11000.
    { key: { mobile: 1 }, name: "uniq_mobile", unique: true },
    { key: { role: 1, active: 1 }, name: "role_active" },
    { key: { createdAt: -1 }, name: "created_desc" },
  ],
  [COLLECTIONS.registrationChallenges]: [
    { key: { challengeId: 1 }, name: "uniq_challenge", unique: true },
    { key: { mobile: 1, createdAt: -1 }, name: "mobile_created" },
    // expireAfterSeconds: 0 means "expire when expiresAt passes".
    { key: { expiresAt: 1 }, name: "ttl_expires", expireAfterSeconds: 0 },
  ],
  [COLLECTIONS.auditEvents]: [
    { key: { at: -1 }, name: "at_desc" },
    { key: { type: 1, at: -1 }, name: "type_at" },
    { key: { "subject.citizenId": 1 }, name: "subject_citizen" },
  ],
  [COLLECTIONS.sessions]: [
    { key: { sessionId: 1 }, name: "uniq_session", unique: true },
    // Lets logout-everywhere revoke every session for one citizen.
    { key: { citizenId: 1 }, name: "session_citizen" },
    { key: { expiresAt: 1 }, name: "ttl_session", expireAfterSeconds: 0 },
  ],
  [COLLECTIONS.loginAttempts]: [
    { key: { key: 1 }, name: "uniq_attempt_key", unique: true },
    { key: { expiresAt: 1 }, name: "ttl_attempts", expireAfterSeconds: 0 },
  ],
  [COLLECTIONS.grievances]: [
    // Partial unique index, scoped to documents that actually carry a string
    // `grievanceId`.
    //
    // A plain unique index cannot be built here: this collection also holds
    // documents written by a separate Mongoose-based service whose schema has no
    // `grievanceId` field. To a unique index those all read as `grievanceId:
    // null`, which collides on the second document and fails the build with
    // E11000 — taking every other index in this batch down with it.
    //
    // The partial filter keeps uniqueness fully enforced for our grievances
    // while leaving the other schema's documents out of scope. This is a
    // narrowing of the index's domain, not a relaxation of the constraint.
    {
      key: { grievanceId: 1 },
      name: "uniq_grievance_id",
      unique: true,
      partialFilterExpression: { grievanceId: { $type: "string" } },
    },
    // Supports "my complaints" for the owning citizen, newest first.
    { key: { citizenId: 1, filedAt: -1 }, name: "citizen_filed" },
    { key: { "routing.departmentId": 1, status: 1 }, name: "dept_status" },
    { key: { "routing.state": 1 }, name: "routing_state" },
    { key: { slaDueAt: 1 }, name: "sla_due" },
    // Geospatial index for later hotspot work; sparse because most grievances
    // have no coordinates and none are ever fabricated.
    { key: { "location.geo": "2dsphere" }, name: "geo_point", sparse: true },
  ],
  [COLLECTIONS.aiDecisions]: [
    { key: { grievanceId: 1, decisionType: 1 }, name: "grievance_decision" },
    { key: { createdAt: -1 }, name: "decision_created" },
  ],
  [COLLECTIONS.voiceDrafts]: [
    { key: { draftId: 1 }, name: "uniq_draft", unique: true },
    { key: { citizenId: 1 }, name: "draft_citizen" },
    { key: { expiresAt: 1 }, name: "ttl_drafts", expireAfterSeconds: 0 },
  ],
  [COLLECTIONS.counters]: [{ key: { key: 1 }, name: "uniq_counter", unique: true }],
  [COLLECTIONS.evidenceDrafts]: [
    { key: { draftId: 1 }, name: "uniq_evidence_draft", unique: true },
    { key: { citizenId: 1 }, name: "evidence_draft_citizen" },
    { key: { expiresAt: 1 }, name: "ttl_evidence_drafts", expireAfterSeconds: 0 },
  ],
  [COLLECTIONS.duplicateLinks]: [
    { key: { duplicateLinkId: 1 }, name: "uniq_duplicate_link", unique: true },
    // One link per ordered pair; a re-analysis updates rather than duplicates.
    {
      key: { primaryGrievanceId: 1, relatedGrievanceId: 1 },
      name: "uniq_duplicate_pair",
      unique: true,
    },
    { key: { relatedGrievanceId: 1 }, name: "link_related" },
    { key: { reviewStatus: 1, createdAt: -1 }, name: "link_review" },
  ],
};

/**
 * Index creation is idempotent but not free, so it runs once per process. The
 * flag lives on globalThis to survive dev-server HMR re-evaluation.
 */
type GlobalWithIndexFlag = typeof globalThis & { __samadhansetu_indexes__?: Promise<void> };

/**
 * Provisions indexes, isolating failures per collection.
 *
 * Index provisioning is a startup concern, not a per-request guarantee. Letting
 * one collection's failure reject the shared promise coupled every database
 * operation in the application to it — a single index conflict in `grievances`
 * was enough to break citizen login, which touches none of it.
 *
 * Failures are therefore logged loudly with the collection name and driver code
 * for an operator to act on, and the remaining collections still get their
 * indexes. Already-existing indexes are unaffected, since `createIndexes` is
 * idempotent for an identical specification.
 */
async function createIndexes(db: Db): Promise<void> {
  for (const [collectionName, specs] of Object.entries(INDEXES)) {
    try {
      await db.collection(collectionName).createIndexes(specs);
    } catch (error: unknown) {
      const { name, code, codeName } = error as {
        name?: unknown;
        code?: unknown;
        codeName?: unknown;
      };
      // Name and code only: driver messages can embed hostnames and document data.
      console.error(
        `[db] index provisioning failed for "${collectionName}": ` +
          `${String(name ?? "UnknownError")}` +
          `${code !== undefined ? ` code=${String(code)}` : ""}` +
          `${codeName !== undefined ? ` (${String(codeName)})` : ""}. ` +
          `Existing indexes are unaffected; other collections continue.`,
      );
    }
  }
}

function ensureIndexes(db: Db): Promise<void> {
  const scope = globalThis as GlobalWithIndexFlag;
  scope.__samadhansetu_indexes__ ??= createIndexes(db).catch((error: unknown) => {
    // Allow a retry on the next request rather than caching the failure.
    // `delete` rather than `= undefined` because exactOptionalPropertyTypes
    // treats an optional property and an explicit undefined as distinct.
    delete scope.__samadhansetu_indexes__;
    throw error;
  });
  return scope.__samadhansetu_indexes__;
}

export interface Collections {
  citizens: Collection<CitizenDocument>;
  challenges: Collection<RegistrationChallengeDocument>;
  auditEvents: Collection<AuditEventDocument>;
  sessions: Collection<SessionDocument>;
  loginAttempts: Collection<LoginAttemptDocument>;
  grievances: Collection<GrievanceDocument>;
  aiDecisions: Collection<AiDecisionDocument>;
  voiceDrafts: Collection<VoiceDraftDocument>;
  counters: Collection<CounterDocument>;
  evidenceDrafts: Collection<EvidenceDraftDocument>;
  duplicateLinks: Collection<DuplicateLinkDocument>;
}

/**
 * Mandatory filter for every query against `grievances`.
 *
 * The collection is shared with a separate Mongoose-based service whose documents
 * have no `grievanceId`, no `normalizedText`, no `routing` and no `citizenId`.
 * Duplicate detection must never read them: it would compare against undefined
 * text and could surface another system's data. Spreading this constant into a
 * filter is cheaper to review than remembering the clause at each call site.
 */
export const SAMADHANSETU_GRIEVANCE_FILTER = {
  grievanceId: { $type: "string" },
} as const;

/** Single entry point for data access; guarantees indexes exist first. */
export async function getCollections(): Promise<Collections> {
  const db = await getDb();
  await ensureIndexes(db);
  return {
    citizens: db.collection<CitizenDocument>(COLLECTIONS.citizens),
    challenges: db.collection<RegistrationChallengeDocument>(COLLECTIONS.registrationChallenges),
    auditEvents: db.collection<AuditEventDocument>(COLLECTIONS.auditEvents),
    sessions: db.collection<SessionDocument>(COLLECTIONS.sessions),
    loginAttempts: db.collection<LoginAttemptDocument>(COLLECTIONS.loginAttempts),
    grievances: db.collection<GrievanceDocument>(COLLECTIONS.grievances),
    aiDecisions: db.collection<AiDecisionDocument>(COLLECTIONS.aiDecisions),
    voiceDrafts: db.collection<VoiceDraftDocument>(COLLECTIONS.voiceDrafts),
    counters: db.collection<CounterDocument>(COLLECTIONS.counters),
    evidenceDrafts: db.collection<EvidenceDraftDocument>(COLLECTIONS.evidenceDrafts),
    duplicateLinks: db.collection<DuplicateLinkDocument>(COLLECTIONS.duplicateLinks),
  };
}

/**
 * Atomically allocates the next grievance sequence number.
 *
 * `findOneAndUpdate` with `$inc` and `upsert` is a single atomic operation, so
 * concurrent submissions cannot receive the same number. The unique index on
 * `grievanceId` is the backstop.
 */
export async function nextSequence(key: string): Promise<number> {
  const { counters } = await getCollections();
  const result = await counters.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return result?.value ?? 1;
}

/** MongoDB duplicate-key error. Surfaced to callers as a friendly message. */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000
  );
}
