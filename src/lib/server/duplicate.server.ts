/**
 * Duplicate complaint detection.
 *
 * SHAPE OF THE PIPELINE — narrow before you spend:
 *
 *   MongoDB filter (department + location + time)   ← bounded, indexed, capped
 *        ↓  at most MAX_CANDIDATES documents
 *   local lexical similarity                        ← free, in-process
 *        ↓  at most MAX_ADJUDICATIONS candidates
 *   Groq adjudication                               ← rate-limited, so capped
 *        ↓
 *   duplicate_links + grievance.duplicate + ai_decisions + audit
 *
 * Groq is NOT called once per historical grievance. The number of model calls per
 * submission is bounded by `MAX_ADJUDICATIONS` and does not grow with the corpus.
 * The free tier has already returned HTTP 429 under modest load, so that bound is
 * a correctness requirement, not an optimisation.
 *
 * WHAT THIS NEVER DOES:
 *  - never deletes, overwrites or merges a grievance
 *  - never removes a citizen's submission
 *  - never blocks a submission
 *  - never fabricates a verdict when the model is unavailable; the analysis is
 *    recorded as ANALYSIS_UNAVAILABLE and left for a human
 *
 * FOREIGN DOCUMENTS: every read spreads `SAMADHANSETU_GRIEVANCE_FILTER`. The
 * `grievances` collection is shared with a separate Mongoose service whose
 * documents have no `grievanceId`, `normalizedText`, `routing` or `citizenId`.
 * Comparing against them would mean scoring undefined text and could surface
 * another system's records to a citizen. There is no unrestricted scan here.
 *
 * PRIVACY: the candidate projection excludes `citizenId`, `description`, `voice`,
 * `location.address` and `aiSnapshot`. The adjudicator therefore never receives a
 * name, mobile, email or street address — those fields are not read from the
 * database at all, rather than being read and then filtered.
 */
import "@tanstack/react-start/server-only";

import type { DepartmentId } from "@/lib/departments";
import {
  CANDIDATE_SIMILARITY_THRESHOLD,
  DUPLICATE_GEO_RADIUS_METRES,
  DUPLICATE_JSON_SCHEMA,
  DUPLICATE_TIME_WINDOW_DAYS,
  HIGH_CONFIDENCE_THRESHOLD,
  MAX_ADJUDICATIONS,
  MAX_CANDIDATES,
  MIN_DUPLICATE_CONFIDENCE,
  POSSIBLE_DUPLICATE_THRESHOLD,
  duplicateAdjudicationSchema,
  type DuplicateReasonCode,
  type RelatedComplaint,
} from "@/lib/validation/duplicate";
import type { GrievanceStatus } from "@/lib/validation/complaint";
import { recordAuditEvent } from "./audit.server";
import {
  getCollections,
  SAMADHANSETU_GRIEVANCE_FILTER,
  type DuplicateLinkDocument,
  type DuplicateStatus,
  type GrievanceDuplicateState,
} from "./collections.server";
import { GROQ_CHAT_MODEL, GROQ_PROVIDER, groqChatJson, isGroqConfigured } from "./groq.server";
import { distanceMetres, textSimilarity } from "./similarity.server";

/* ────────────────────────── internal shapes ────────────────────────── */

/**
 * A candidate as read from MongoDB. Note what is absent: no citizenId, no
 * description, no address. This is the full extent of what duplicate detection
 * knows about another citizen's complaint.
 */
interface CandidateRecord {
  grievanceId: string;
  title: string;
  normalizedText: string;
  status: GrievanceStatus;
  filedAt: Date;
  district: string;
  pincode?: string;
  geo?: { coordinates: [number, number] };
}

interface ScoredCandidate extends CandidateRecord {
  similarity: number;
  metres?: number;
  reasonCode: DuplicateReasonCode;
}

export interface DuplicateSubject {
  /** Omitted for the pre-submission check, where no grievance exists yet. */
  grievanceId?: string;
  title: string;
  normalizedText: string;
  departmentId?: DepartmentId;
  district: string;
  pincode?: string;
  coordinates?: { longitude: number; latitude: number };
}

/* ────────────────────────── candidate retrieval ────────────────────────── */

/**
 * Builds the location clause.
 *
 * `$geoWithin` with `$centerSphere` is used rather than `$near` because
 * `$near` requires a 2dsphere index, and this collection is shared with another
 * service whose documents have a different `location` shape — building a
 * geospatial index over it is a risk not worth taking for a bounded query.
 * `$centerSphere` needs no index.
 *
 * Falls back to pincode, then district, so a complaint filed without device
 * location still gets meaningful candidates instead of none.
 */
function locationClause(subject: DuplicateSubject): Record<string, unknown> {
  if (subject.coordinates !== undefined) {
    const EARTH_RADIUS_METRES = 6_371_000;
    return {
      "location.geo": {
        $geoWithin: {
          $centerSphere: [
            [subject.coordinates.longitude, subject.coordinates.latitude],
            DUPLICATE_GEO_RADIUS_METRES / EARTH_RADIUS_METRES,
          ],
        },
      },
    };
  }
  if (subject.pincode !== undefined && subject.pincode !== "") {
    return { "location.pincode": subject.pincode };
  }
  return { "location.district": subject.district };
}

function reasonCodeFor(subject: DuplicateSubject, candidate: CandidateRecord): DuplicateReasonCode {
  if (subject.coordinates !== undefined && candidate.geo !== undefined) return "NEARBY_SIMILAR";
  if (
    subject.pincode !== undefined &&
    subject.pincode !== "" &&
    candidate.pincode === subject.pincode
  ) {
    return "SAME_PINCODE_SIMILAR";
  }
  return "SAME_DISTRICT_SIMILAR";
}

/**
 * Reads a bounded set of comparable grievances.
 *
 * Restricted on four axes at once — SamadhanSetu documents only, department (when
 * known), location, and a time window — then hard-capped. The result set size is
 * independent of how large the corpus grows.
 */
async function findCandidates(subject: DuplicateSubject): Promise<CandidateRecord[]> {
  const { grievances } = await getCollections();
  const windowStart = new Date(Date.now() - DUPLICATE_TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const filter: Record<string, unknown> = {
    // Mandatory. Excludes the foreign Mongoose documents.
    ...SAMADHANSETU_GRIEVANCE_FILTER,
    // Only text that the classifier actually produced can be compared.
    normalizedText: { $type: "string" },
    filedAt: { $gte: windowStart },
    ...locationClause(subject),
  };

  // The department is unknown before classification, so the pre-submission check
  // simply omits this clause rather than guessing a department.
  if (subject.departmentId !== undefined) {
    filter["routing.departmentId"] = subject.departmentId;
  }
  // Never compare a grievance with itself.
  if (subject.grievanceId !== undefined) {
    filter["grievanceId"] = {
      ...SAMADHANSETU_GRIEVANCE_FILTER.grievanceId,
      $ne: subject.grievanceId,
    };
  }

  const documents = await grievances
    .find(filter, {
      // Explicit allow-list. PII fields are never read, not merely dropped later.
      projection: {
        _id: 0,
        grievanceId: 1,
        title: 1,
        normalizedText: 1,
        status: 1,
        filedAt: 1,
        "location.district": 1,
        "location.pincode": 1,
        "location.geo.coordinates": 1,
      },
    })
    .sort({ filedAt: -1 })
    .limit(MAX_CANDIDATES)
    .toArray();

  return documents.map((document) => {
    const location = document.location as
      { district?: string; pincode?: string; geo?: { coordinates?: [number, number] } } | undefined;
    return {
      grievanceId: document.grievanceId,
      title: document.title,
      normalizedText: document.normalizedText,
      status: document.status,
      filedAt: document.filedAt,
      district: location?.district ?? "",
      ...(location?.pincode !== undefined ? { pincode: location.pincode } : {}),
      ...(location?.geo?.coordinates !== undefined
        ? { geo: { coordinates: location.geo.coordinates } }
        : {}),
    };
  });
}

/** Scores, filters by the documented threshold, and orders best-first. */
function scoreCandidates(
  subject: DuplicateSubject,
  candidates: readonly CandidateRecord[],
): ScoredCandidate[] {
  const subjectText = `${subject.title} ${subject.normalizedText}`;

  return candidates
    .map((candidate) => {
      const similarity = textSimilarity(
        subjectText,
        `${candidate.title} ${candidate.normalizedText}`,
      );
      const metres =
        subject.coordinates !== undefined && candidate.geo !== undefined
          ? distanceMetres(
              [subject.coordinates.longitude, subject.coordinates.latitude],
              candidate.geo.coordinates,
            )
          : undefined;
      return {
        ...candidate,
        similarity,
        ...(metres !== undefined ? { metres } : {}),
        reasonCode: reasonCodeFor(subject, candidate),
      };
    })
    .filter((candidate) => candidate.similarity >= CANDIDATE_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);
}

/** Maps an internal candidate to the citizen-safe shape. */
function toRelatedComplaint(candidate: ScoredCandidate): RelatedComplaint {
  return {
    grievanceId: candidate.grievanceId,
    // District only. Never the address the other citizen typed.
    area: candidate.district,
    filedOn: candidate.filedAt.toISOString(),
    status: candidate.status,
    similarityPercent: Math.round(candidate.similarity * 100),
    reasonCode: candidate.reasonCode,
    // Coarsened to 50 m so the value cannot be used to triangulate a home.
    ...(candidate.metres !== undefined
      ? { approxDistanceMetres: Math.round(candidate.metres / 50) * 50 }
      : {}),
  };
}

/* ────────────────────────── pre-submission check ────────────────────────── */

/**
 * Cheap, read-only duplicate warning shown before the citizen submits.
 *
 * No Groq call, no writes, and no department filter — classification has not run
 * yet, so filtering by department would mean inventing one. Because it is
 * advisory, a failure here is silent: the citizen still gets to submit.
 *
 * The browser receives only `RelatedComplaint` values.
 */
export async function precheckDuplicates(
  subject: DuplicateSubject,
): Promise<{ related: RelatedComplaint[] }> {
  try {
    // Drop `grievanceId` entirely rather than setting it undefined: nothing exists
    // yet to exclude from the candidate set.
    const { grievanceId: _ignored, ...anonymousSubject } = subject;
    const candidates = await findCandidates(anonymousSubject);
    const scored = scoreCandidates(subject, candidates)
      // Only warn at the documented "possible duplicate" level. Anything weaker is
      // noise and would train citizens to dismiss the warning.
      .filter((candidate) => candidate.similarity >= POSSIBLE_DUPLICATE_THRESHOLD)
      .slice(0, MAX_ADJUDICATIONS);

    return { related: scored.map(toRelatedComplaint) };
  } catch (error: unknown) {
    // Advisory only: never let this stop a citizen from filing.
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[duplicate] precheck failed: ${name}`);
    return { related: [] };
  }
}

/* ────────────────────────── adjudication ────────────────────────── */

const ADJUDICATION_SYSTEM_PROMPT = `You compare two citizen grievances filed with an Indian municipal grievance system and decide whether they report THE SAME underlying problem.

Answer isDuplicate: true ONLY when both complaints describe the same specific problem at the same place. Examples of the same problem: the same pothole on the same stretch of road; the same overflowing garbage point; the same transformer failure causing the same outage.

Answer isDuplicate: false when the complaints describe DIFFERENT problems, even if they are similar in kind or nearby. Two separate potholes on the same road are NOT duplicates. A water leak and a drainage blockage are NOT duplicates. A recurring problem reported again after being resolved is NOT a duplicate.

Set confidence to your genuine certainty between 0 and 1. Use a low value when the texts are too vague to tell. Do not inflate confidence.

In reasoning, state briefly why the two do or do not describe the same problem. Do not mention any person, phone number, house number or street address. Do not quote either complaint. Keep it under 60 words.`;

interface AdjudicationOutcome {
  isDuplicate: boolean;
  confidence: number;
  reasoning: string;
  model: string;
  attempts: number;
}

/**
 * Asks the model whether two complaints describe the same problem.
 *
 * Receives only the two normalised texts — no citizen identity, no address, no
 * grievance numbers. Returns `undefined` on any provider failure so the caller
 * can record ANALYSIS_UNAVAILABLE rather than guess.
 */
async function adjudicate(
  subject: DuplicateSubject,
  candidate: ScoredCandidate,
): Promise<AdjudicationOutcome | undefined> {
  const user = [
    "COMPLAINT A (previously filed):",
    `Title: ${candidate.title}`,
    `Details: ${candidate.normalizedText}`,
    "",
    "COMPLAINT B (new):",
    `Title: ${subject.title}`,
    `Details: ${subject.normalizedText}`,
  ].join("\n");

  try {
    const response = await groqChatJson({
      system: ADJUDICATION_SYSTEM_PROMPT,
      user,
      jsonSchema: DUPLICATE_JSON_SCHEMA,
      schemaName: "duplicate_adjudication",
      maxTokens: 400,
    });

    const parsed = duplicateAdjudicationSchema.safeParse(response.data);
    // Invalid output is a provider failure, not a "not duplicate" answer.
    if (!parsed.success) return undefined;

    return { ...parsed.data, model: response.model, attempts: 1 };
  } catch (error: unknown) {
    // Status only; 429 and 5xx are both simply "unavailable" here.
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[duplicate] adjudication unavailable: ${name}`);
    return undefined;
  }
}

/**
 * Applies the documented thresholds to one adjudicated pair.
 *
 * Only ever called with a real adjudication result. A missing result is NOT a
 * verdict — the caller keeps those candidates aside and reports
 * `ANALYSIS_UNAVAILABLE`, because turning a provider outage into
 * "possible duplicate" would assert a relationship nothing established.
 */
function verdictFor(outcome: AdjudicationOutcome): DuplicateStatus {
  if (!outcome.isDuplicate) return "NOT_DUPLICATE";
  if (outcome.confidence >= HIGH_CONFIDENCE_THRESHOLD) return "HIGH_CONFIDENCE_DUPLICATE";
  // A hedged yes is a flag for review, not an assertion.
  if (outcome.confidence >= MIN_DUPLICATE_CONFIDENCE) return "POSSIBLE_DUPLICATE";
  return "NOT_DUPLICATE";
}

/* ────────────────────────── authoritative analysis ────────────────────────── */

export interface DuplicateAnalysisResult {
  state: GrievanceDuplicateState;
  /** Citizen-safe descriptions of anything flagged. Never full documents. */
  related: RelatedComplaint[];
}

/**
 * Runs the authoritative pass for a grievance that has already been saved.
 *
 * Called after insertion and after classification, so the department is known and
 * the complaint is already safely persisted. Nothing in this function can lose a
 * complaint: it only inserts links and sets the additive `duplicate` field.
 *
 * `ANALYSIS_UNAVAILABLE` is a real outcome. When Groq is unconfigured, rate
 * limited or returns something invalid, that is recorded honestly with a reason so
 * an officer can revisit it. It is never converted into a duplicate verdict, and
 * never into a silent "not duplicate".
 */
export async function analyzeDuplicates(
  subject: DuplicateSubject & { grievanceId: string; citizenId: string },
): Promise<DuplicateAnalysisResult> {
  const now = new Date();

  /**
   * Records the pending state and reports it.
   *
   * Persisting matters: `ANALYSIS_UNAVAILABLE` is the grievance's real duplicate
   * state until someone revisits it, so it has to outlive this request. The write
   * is best-effort — if the database is the thing that failed, the complaint is
   * still already saved and must not be jeopardised by this bookkeeping.
   */
  const unavailable = async (
    reason: string,
    candidatesConsidered: number,
  ): Promise<DuplicateAnalysisResult> => {
    const state: GrievanceDuplicateState = {
      status: "ANALYSIS_UNAVAILABLE",
      candidatesConsidered,
      unavailableReason: reason,
      analysedAt: now,
      source: "AI",
    };
    try {
      const { grievances } = await getCollections();
      await grievances.updateOne(
        { ...SAMADHANSETU_GRIEVANCE_FILTER, grievanceId: subject.grievanceId },
        { $set: { duplicate: state, updatedAt: new Date() } },
      );
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "UnknownError";
      console.error(`[duplicate] could not record pending state: ${name}`);
    }
    return { state, related: [] };
  };

  let candidateCount = 0;
  try {
    const candidates = await findCandidates(subject);
    const scored = scoreCandidates(subject, candidates);
    candidateCount = scored.length;

    await recordAuditEvent({
      type: "DUPLICATE_ANALYSIS",
      actor: { kind: "SYSTEM" },
      subject: { kind: "GRIEVANCE", grievanceId: subject.grievanceId },
      metadata: {
        candidatesRead: candidates.length,
        candidatesScored: scored.length,
        geoFiltered: subject.coordinates !== undefined,
        windowDays: DUPLICATE_TIME_WINDOW_DAYS,
        ...(subject.departmentId !== undefined ? { departmentId: subject.departmentId } : {}),
      },
    });

    if (scored.length === 0) {
      return {
        state: {
          status: "NOT_DUPLICATE",
          candidatesConsidered: 0,
          analysedAt: now,
          source: "AI",
        },
        related: [],
      };
    }

    // Honest state rather than a lexical guess dressed up as an AI decision.
    if (!isGroqConfigured()) return unavailable("provider_not_configured", scored.length);

    const { duplicateLinks, aiDecisions, grievances } = await getCollections();
    // Bounded: at most MAX_ADJUDICATIONS model calls, regardless of corpus size.
    const shortlist = scored.slice(0, MAX_ADJUDICATIONS);

    const related: RelatedComplaint[] = [];
    let best:
      { candidate: ScoredCandidate; status: DuplicateStatus; confidence?: number } | undefined;
    let providerFailures = 0;

    for (const candidate of shortlist) {
      const outcome = await adjudicate(subject, candidate);
      // A provider failure yields no verdict for this pair. It is counted and the
      // candidate is skipped — no link, no assertion, nothing inferred from the
      // lexical score alone.
      if (outcome === undefined) {
        providerFailures += 1;
        continue;
      }
      const status = verdictFor(outcome);

      if (status !== "NOT_DUPLICATE") {
        // Directional: the earlier complaint is primary, the new one is related.
        const link: DuplicateLinkDocument = {
          duplicateLinkId: Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
          primaryGrievanceId: candidate.grievanceId,
          relatedGrievanceId: subject.grievanceId,
          similarity: candidate.similarity,
          confidence: outcome.confidence,
          rationale: outcome.reasoning,
          ...(candidate.metres !== undefined ? { distanceMetres: candidate.metres } : {}),
          status,
          // Always reviewable. Nothing is treated as settled by the machine.
          reviewStatus: "PENDING_REVIEW",
          source: "AI_ADJUDICATION",
          provider: GROQ_PROVIDER,
          model: outcome.model,
          createdAt: now,
        };

        try {
          await duplicateLinks.insertOne(link);
        } catch (error: unknown) {
          // A pre-existing link for this pair is fine; the unique index did its job.
          const name = error instanceof Error ? error.name : "UnknownError";
          console.error(`[duplicate] link insert skipped: ${name}`);
        }

        // Explainability record, mirroring CLASSIFICATION and PRIORITY.
        await aiDecisions.insertOne({
          grievanceId: subject.grievanceId,
          decisionType: "DUPLICATE",
          provider: GROQ_PROVIDER,
          model: outcome.model,
          modelVersion: GROQ_CHAT_MODEL,
          inputReference: {
            kind: "COMPLAINT_PAIR",
            sha256: await sha256Hex(`${candidate.normalizedText}\u0000${subject.normalizedText}`),
            length: candidate.normalizedText.length + subject.normalizedText.length,
            comparedGrievanceId: candidate.grievanceId,
          },
          output: {
            isDuplicate: outcome.isDuplicate,
            status,
            similarity: candidate.similarity,
          },
          confidence: outcome.confidence,
          reasoning: outcome.reasoning,
          attempts: outcome.attempts,
          createdAt: now,
        });

        await recordAuditEvent({
          type: "DUPLICATE_DETECTED",
          actor: { kind: "SYSTEM" },
          subject: { kind: "GRIEVANCE", grievanceId: subject.grievanceId },
          metadata: {
            primaryGrievanceId: candidate.grievanceId,
            status,
            similarity: candidate.similarity,
            confidence: outcome.confidence,
            source: link.source,
          },
        });

        related.push(toRelatedComplaint(candidate));
        // Rank HIGH above POSSIBLE, then by similarity.
        const rank = (value: DuplicateStatus): number =>
          value === "HIGH_CONFIDENCE_DUPLICATE" ? 2 : value === "POSSIBLE_DUPLICATE" ? 1 : 0;
        if (best === undefined || rank(status) > rank(best.status)) {
          best = { candidate, status, confidence: outcome.confidence };
        }
      }
    }

    // Nothing was adjudicated successfully. Report that honestly instead of a
    // clean "not duplicate" the system never established — an officer can revisit
    // it, and the citizen is told the check could not be completed.
    if (providerFailures === shortlist.length && providerFailures > 0) {
      const state: GrievanceDuplicateState = {
        status: "ANALYSIS_UNAVAILABLE",
        candidatesConsidered: scored.length,
        unavailableReason: "provider_unavailable",
        analysedAt: now,
        source: "AI",
      };
      // Persisted so the pending state is durable and reviewable, not just a
      // value returned to one request.
      await grievances.updateOne(
        { ...SAMADHANSETU_GRIEVANCE_FILTER, grievanceId: subject.grievanceId },
        { $set: { duplicate: state, updatedAt: new Date() } },
      );
      return { state, related: [] };
    }

    const state: GrievanceDuplicateState =
      best === undefined
        ? {
            status: "NOT_DUPLICATE",
            candidatesConsidered: scored.length,
            analysedAt: now,
            source: "AI",
          }
        : {
            status: best.status,
            primaryGrievanceId: best.candidate.grievanceId,
            similarity: best.candidate.similarity,
            ...(best.confidence !== undefined ? { confidence: best.confidence } : {}),
            candidatesConsidered: scored.length,
            analysedAt: now,
            source: "AI",
          };

    // Additive update. Touches only `duplicate`, so routing, classification, SLA
    // and the citizen's own text are left exactly as they were.
    await grievances.updateOne(
      { ...SAMADHANSETU_GRIEVANCE_FILTER, grievanceId: subject.grievanceId },
      { $set: { duplicate: state, updatedAt: new Date() } },
    );

    if (best !== undefined) {
      await recordAuditEvent({
        type: "DUPLICATE_LINKED",
        actor: { kind: "SYSTEM" },
        subject: {
          kind: "GRIEVANCE",
          grievanceId: subject.grievanceId,
          citizenId: subject.citizenId,
        },
        metadata: {
          status: best.status,
          primaryGrievanceId: best.candidate.grievanceId,
          linksCreated: related.length,
          reviewStatus: "PENDING_REVIEW",
        },
      });
    }

    return { state, related };
  } catch (error: unknown) {
    // The grievance is already saved and stays saved. Only the analysis failed.
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[duplicate] analysis failed: ${name}`);
    return unavailable("analysis_error", candidateCount);
  }
}

/** SHA-256 hex, so an input can be referenced without being stored again. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
