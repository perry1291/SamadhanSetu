/**
 * Citizen registration orchestration. All database access and every security
 * decision lives here; the route component only renders what these functions
 * return.
 *
 * Flow and why it is shaped this way:
 *
 *   start    → validate details server-side, create a PENDING challenge holding
 *              the validated details plus a hashed OTP. No citizen row yet, so
 *              an abandoned registration leaves no account behind.
 *   verify   → check the OTP against the hash under expiry and attempt limits.
 *              On success issue a one-time verification token.
 *   complete → require that token, hash the MPIN, insert the citizen.
 *
 * The verification token is what stops a caller from skipping straight to
 * `complete` with a known challengeId: possession of the token proves this
 * session passed OTP verification.
 *
 * Every failure returns a stable error CODE. Driver messages and stack traces
 * never reach the client.
 */
import "@tanstack/react-start/server-only";

import { COUNTRY } from "@/lib/locations";
import {
  maskMobile,
  mpinPairSchema,
  otpCodeSchema,
  registrationDetailsSchema,
  toFieldErrors,
  type ErrorCode,
} from "@/lib/validation/registration";
import { recordAuditEvent } from "./audit.server";
import {
  getCollections,
  isDuplicateKeyError,
  type CitizenDocument,
  type RegistrationChallengeDocument,
} from "./collections.server";
import {
  generateOpaqueToken,
  generateOtpCode,
  hashMpin,
  hashOtp,
  hashToken,
  verifyOtpHash,
  verifyToken,
} from "./crypto.server";
import { DatabaseUnavailableError } from "./db.server";
import { resolveOtpProvider, type OtpDeliveryStatus } from "./otp-provider.server";

/* ────────────────────────── policy ────────────────────────── */

const OTP_TTL_MS = 5 * 60 * 1000; // code validity
const CHALLENGE_TTL_MS = 30 * 60 * 1000; // whole registration session
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_RESENDS = 3;
/** Per-mobile ceiling on new challenges, to blunt SMS-pumping and enumeration. */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_CHALLENGES = 5;

/* ────────────────────────── result shapes ────────────────────────── */

/**
 * Deliberately narrow. No citizen PII beyond a masked mobile, never the OTP,
 * never the MPIN, never a hash, never an internal id the client has no use for.
 */
export type StartResult =
  | {
      ok: true;
      challengeId: string;
      maskedMobile: string;
      otpExpiresAt: string;
      deliveryStatus: OtpDeliveryStatus;
      attemptsRemaining: number;
      resendsRemaining: number;
    }
  | { ok: false; error: ErrorCode; fieldErrors?: Record<string, ErrorCode> };

export type ResendResult =
  | {
      ok: true;
      otpExpiresAt: string;
      deliveryStatus: OtpDeliveryStatus;
      resendsRemaining: number;
      attemptsRemaining: number;
    }
  | { ok: false; error: ErrorCode };

export type VerifyResult =
  | { ok: true; verificationToken: string }
  | { ok: false; error: ErrorCode; attemptsRemaining?: number };

export type CompleteResult =
  | { ok: true; maskedMobile: string }
  | { ok: false; error: ErrorCode; fieldErrors?: Record<string, ErrorCode> };

/* ────────────────────────── helpers ────────────────────────── */

function mapUnexpectedError(error: unknown, context: string): ErrorCode {
  if (error instanceof DatabaseUnavailableError) return "database_unavailable";
  const name = error instanceof Error ? error.name : "UnknownError";
  // Name only. Driver messages can embed hostnames or credentials.
  console.error(`[registration] ${context} failed: ${name}`);
  return "server_error";
}

async function findLiveChallenge(
  challengeId: string,
): Promise<
  { ok: true; challenge: RegistrationChallengeDocument } | { ok: false; error: ErrorCode }
> {
  const { challenges } = await getCollections();
  const challenge = await challenges.findOne({ challengeId });
  if (challenge === null) return { ok: false, error: "challenge_not_found" };
  if (challenge.consumedAt !== undefined) return { ok: false, error: "challenge_not_found" };
  // TTL deletion is lazy (up to a minute), so expiry is also checked explicitly.
  if (challenge.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "challenge_expired" };
  }
  return { ok: true, challenge };
}

/* ────────────────────────── step 1: start ────────────────────────── */

export async function startRegistration(rawInput: unknown): Promise<StartResult> {
  const parsed = registrationDetailsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "registration_failed",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  const details = parsed.data;

  try {
    const { citizens, challenges } = await getCollections();

    // Friendly pre-check. The unique index remains the real guarantee.
    const existing = await citizens.findOne({ mobile: details.mobile }, { projection: { _id: 1 } });
    if (existing !== null) return { ok: false, error: "mobile_already_registered" };

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recent = await challenges.countDocuments({
      mobile: details.mobile,
      createdAt: { $gte: since },
    });
    if (recent >= RATE_LIMIT_MAX_CHALLENGES) return { ok: false, error: "otp_rate_limited" };

    const now = new Date();
    const otpCode = generateOtpCode();
    const challengeId = generateOpaqueToken(16);
    const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);

    const delivery = await resolveOtpProvider().sendOtp({
      mobile: details.mobile,
      code: otpCode,
    });

    await challenges.insertOne({
      challengeId,
      mobile: details.mobile,
      details: {
        fullName: details.fullName,
        gender: details.gender,
        address: {
          premise: details.premise,
          ...(details.subLocality !== undefined && details.subLocality !== ""
            ? { subLocality: details.subLocality }
            : {}),
          locality: details.locality,
          country: COUNTRY.code,
          state: details.state,
          district: details.district,
          pincode: details.pincode,
        },
        mobile: details.mobile,
        ...(details.phone !== undefined ? { phone: details.phone } : {}),
        ...(details.email !== undefined ? { email: details.email } : {}),
      },
      otpHash: await hashOtp(otpCode),
      otpExpiresAt,
      attemptsUsed: 0,
      resendsUsed: 0,
      otpVerified: false,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    });

    await recordAuditEvent({
      type: "REGISTRATION_STARTED",
      actor: { kind: "CITIZEN_SELF" },
      subject: { kind: "REGISTRATION", challengeId },
      metadata: {
        mobileMasked: maskMobile(details.mobile),
        state: details.state,
        district: details.district,
        deliveryStatus: delivery.status,
        otpProvider: resolveOtpProvider().id,
      },
    });

    return {
      ok: true,
      challengeId,
      maskedMobile: maskMobile(details.mobile),
      otpExpiresAt: otpExpiresAt.toISOString(),
      deliveryStatus: delivery.status,
      attemptsRemaining: MAX_VERIFY_ATTEMPTS,
      resendsRemaining: MAX_RESENDS,
    };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "startRegistration") };
  }
}

/* ────────────────────────── step 2a: resend ────────────────────────── */

export async function resendOtp(rawChallengeId: unknown): Promise<ResendResult> {
  if (typeof rawChallengeId !== "string" || rawChallengeId === "") {
    return { ok: false, error: "challenge_not_found" };
  }

  try {
    const found = await findLiveChallenge(rawChallengeId);
    if (!found.ok) return { ok: false, error: found.error };
    const { challenge } = found;

    if (challenge.otpVerified) return { ok: false, error: "challenge_not_found" };
    if (challenge.resendsUsed >= MAX_RESENDS) return { ok: false, error: "otp_resend_limit" };

    const { challenges } = await getCollections();
    const now = new Date();
    const otpCode = generateOtpCode();
    const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);

    const delivery = await resolveOtpProvider().sendOtp({
      mobile: challenge.mobile,
      code: otpCode,
    });

    // A resend invalidates the previous code and restores the attempt budget.
    const updated = await challenges.findOneAndUpdate(
      { challengeId: challenge.challengeId, otpVerified: false },
      {
        $set: {
          otpHash: await hashOtp(otpCode),
          otpExpiresAt,
          attemptsUsed: 0,
          updatedAt: now,
        },
        $inc: { resendsUsed: 1 },
      },
      { returnDocument: "after" },
    );
    if (updated === null) return { ok: false, error: "challenge_not_found" };

    return {
      ok: true,
      otpExpiresAt: otpExpiresAt.toISOString(),
      deliveryStatus: delivery.status,
      resendsRemaining: Math.max(0, MAX_RESENDS - updated.resendsUsed),
      attemptsRemaining: MAX_VERIFY_ATTEMPTS,
    };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "resendOtp") };
  }
}

/* ────────────────────────── step 2b: verify ────────────────────────── */

export async function verifyRegistrationOtp(rawInput: unknown): Promise<VerifyResult> {
  const input = rawInput as { challengeId?: unknown; code?: unknown } | null;
  const challengeId = typeof input?.challengeId === "string" ? input.challengeId : "";
  if (challengeId === "") return { ok: false, error: "challenge_not_found" };

  const codeParsed = otpCodeSchema.safeParse(input?.code ?? "");

  try {
    const found = await findLiveChallenge(challengeId);
    if (!found.ok) return { ok: false, error: found.error };
    const { challenge } = found;
    const { challenges } = await getCollections();

    // Already verified: do not allow reuse to mint a second token.
    if (challenge.otpVerified) return { ok: false, error: "challenge_not_found" };

    if (challenge.attemptsUsed >= MAX_VERIFY_ATTEMPTS) {
      return { ok: false, error: "otp_attempts_exceeded", attemptsRemaining: 0 };
    }
    if (challenge.otpExpiresAt.getTime() <= Date.now()) {
      await recordAuditEvent({
        type: "OTP_VERIFICATION_FAILURE",
        actor: { kind: "CITIZEN_SELF" },
        subject: { kind: "REGISTRATION", challengeId },
        metadata: { reason: "otp_expired", mobileMasked: maskMobile(challenge.mobile) },
      });
      return { ok: false, error: "otp_expired" };
    }

    // Malformed input still consumes an attempt: it must not be a free probe.
    const isMatch = codeParsed.success && (await verifyOtpHash(codeParsed.data, challenge.otpHash));

    if (!isMatch) {
      const afterFailure = await challenges.findOneAndUpdate(
        { challengeId, otpVerified: false },
        { $inc: { attemptsUsed: 1 }, $set: { updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      const attemptsRemaining = Math.max(
        0,
        MAX_VERIFY_ATTEMPTS - (afterFailure?.attemptsUsed ?? MAX_VERIFY_ATTEMPTS),
      );
      await recordAuditEvent({
        type: "OTP_VERIFICATION_FAILURE",
        actor: { kind: "CITIZEN_SELF" },
        subject: { kind: "REGISTRATION", challengeId },
        metadata: {
          reason: codeParsed.success ? "otp_invalid" : "otp_malformed",
          attemptsRemaining,
          mobileMasked: maskMobile(challenge.mobile),
        },
      });
      return {
        ok: false,
        error: attemptsRemaining === 0 ? "otp_attempts_exceeded" : "otp_invalid",
        attemptsRemaining,
      };
    }

    const verificationToken = generateOpaqueToken(32);
    const now = new Date();

    // Conditional on otpVerified:false so two concurrent correct submissions
    // cannot both mint a token.
    const claimed = await challenges.findOneAndUpdate(
      { challengeId, otpVerified: false },
      {
        $set: {
          otpVerified: true,
          otpVerifiedAt: now,
          verificationTokenHash: await hashToken(verificationToken),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (claimed === null) return { ok: false, error: "challenge_not_found" };

    await recordAuditEvent({
      type: "OTP_VERIFICATION_SUCCESS",
      actor: { kind: "CITIZEN_SELF" },
      subject: { kind: "REGISTRATION", challengeId },
      metadata: {
        mobileMasked: maskMobile(challenge.mobile),
        attemptsUsed: claimed.attemptsUsed,
      },
    });

    return { ok: true, verificationToken };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "verifyRegistrationOtp") };
  }
}

/* ────────────────────────── step 3: complete ────────────────────────── */

export async function completeRegistration(rawInput: unknown): Promise<CompleteResult> {
  const input = rawInput as {
    challengeId?: unknown;
    verificationToken?: unknown;
    mpin?: unknown;
    confirmMpin?: unknown;
  } | null;

  const challengeId = typeof input?.challengeId === "string" ? input.challengeId : "";
  const token = typeof input?.verificationToken === "string" ? input.verificationToken : "";
  if (challengeId === "" || token === "") return { ok: false, error: "verification_required" };

  const mpinParsed = mpinPairSchema.safeParse({
    mpin: typeof input?.mpin === "string" ? input.mpin : "",
    confirmMpin: typeof input?.confirmMpin === "string" ? input.confirmMpin : "",
  });
  if (!mpinParsed.success) {
    const fieldErrors = toFieldErrors(mpinParsed.error);
    return {
      ok: false,
      error: fieldErrors["mpin"] ?? fieldErrors["confirmMpin"] ?? "mpin_invalid",
      fieldErrors,
    };
  }

  try {
    const found = await findLiveChallenge(challengeId);
    if (!found.ok) return { ok: false, error: found.error };
    const { challenge } = found;

    if (!challenge.otpVerified || challenge.verificationTokenHash === undefined) {
      return { ok: false, error: "otp_not_verified" };
    }
    // Proves this caller is the session that passed OTP verification.
    if (!(await verifyToken(token, challenge.verificationTokenHash))) {
      return { ok: false, error: "verification_required" };
    }

    const { citizens, challenges } = await getCollections();
    const now = new Date();

    const citizen: CitizenDocument = {
      fullName: challenge.details.fullName,
      gender: challenge.details.gender,
      address: challenge.details.address,
      mobile: challenge.mobile,
      ...(challenge.details.phone !== undefined ? { phone: challenge.details.phone } : {}),
      ...(challenge.details.email !== undefined ? { email: challenge.details.email } : {}),
      // Server-assigned. The client has no input into role.
      role: "CITIZEN",
      mobileVerified: true,
      mpinHash: await hashMpin(mpinParsed.data.mpin),
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    let citizenId: string;
    try {
      const inserted = await citizens.insertOne(citizen);
      citizenId = inserted.insertedId.toHexString();
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        // Lost a race, or the citizen registered in another tab. Retire the
        // challenge so the stale token cannot be replayed.
        await challenges.updateOne({ challengeId }, { $set: { consumedAt: now, updatedAt: now } });
        return { ok: false, error: "mobile_already_registered" };
      }
      throw error;
    }

    // Single-use: retire the challenge so the token cannot create a second account.
    await challenges.updateOne({ challengeId }, { $set: { consumedAt: now, updatedAt: now } });

    await recordAuditEvent({
      type: "REGISTRATION_COMPLETED",
      actor: { kind: "CITIZEN_SELF", citizenId },
      subject: { kind: "REGISTRATION", challengeId, citizenId },
      metadata: {
        mobileMasked: maskMobile(challenge.mobile),
        role: "CITIZEN",
        state: challenge.details.address.state,
        district: challenge.details.address.district,
      },
    });

    // Masked mobile only. No name, address, email or internal id.
    return { ok: true, maskedMobile: maskMobile(challenge.mobile) };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "completeRegistration") };
  }
}
