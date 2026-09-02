/**
 * Citizen authentication: login, logout and the current-user lookup.
 *
 * Security properties implemented here:
 *
 *  - Generic failure. Unknown mobile, wrong MPIN, malformed input and an
 *    inactive account all return `invalid_credentials`. The response never
 *    discloses whether an account exists.
 *  - Timing equalisation. When the mobile is unknown, a decoy PBKDF2 verify runs
 *    anyway. Without it, a ~100ms difference between "no such account" and
 *    "wrong MPIN" would be a reliable account-enumeration oracle.
 *  - Brute-force throttling. Failures are counted per normalised mobile with a
 *    progressive, self-clearing lockout. Counters are kept for unknown numbers
 *    too, otherwise a lockout response would itself reveal account existence.
 *  - Role from the database. The role stored on the session and returned to the
 *    client is read from the citizen document; client input cannot influence it.
 */
import "@tanstack/react-start/server-only";

import { getRequestIP } from "@tanstack/react-start/server";

import { maskMobile } from "@/lib/validation/registration";
import { loginSchema } from "@/lib/validation/login";
import type { ErrorCode } from "@/lib/validation/registration";
import { recordAuditEvent } from "./audit.server";
import { getCollections } from "./collections.server";
import { hashMpin, verifyMpin } from "./crypto.server";
import { DatabaseUnavailableError } from "./db.server";
import {
  createSession,
  destroyCurrentSession,
  getOptionalUser,
  type AuthenticatedUser,
} from "./session.server";

/* ────────────────────────── throttling policy ────────────────────────── */

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const FAILURES_BEFORE_LOCKOUT = 5;
/**
 * Progressive and always temporary — a citizen who mistypes is never locked out
 * permanently. Each tier applies once that many failures have accumulated.
 */
const LOCKOUT_TIERS: { failures: number; lockMs: number }[] = [
  { failures: 15, lockMs: 60 * 60 * 1000 },
  { failures: 10, lockMs: 15 * 60 * 1000 },
  { failures: FAILURES_BEFORE_LOCKOUT, lockMs: 5 * 60 * 1000 },
];

/** A decoy hash so the unknown-account path costs the same as a real verify. */
let decoyHashPromise: Promise<string> | undefined;
function getDecoyHash(): Promise<string> {
  // Value is irrelevant; only the cost of verifying against it matters.
  decoyHashPromise ??= hashMpin("000000");
  return decoyHashPromise;
}

/* ────────────────────────── result shapes ────────────────────────── */

export type LoginResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; error: ErrorCode; retryAfterSeconds?: number };

export type LogoutResult = { ok: true };

function mapUnexpectedError(error: unknown, context: string): ErrorCode {
  if (error instanceof DatabaseUnavailableError) return "database_unavailable";
  const name = error instanceof Error ? error.name : "UnknownError";
  // Name only — driver messages can embed hostnames or credentials.
  console.error(`[auth] ${context} failed: ${name}`);
  return "server_error";
}

/** Coarse client identifier for audit only. Never used as an auth signal. */
function requestIpHint(): string {
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip === undefined) return "unknown";
    // Truncate: enough to correlate abuse, not a full address in the audit log.
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : "ipv6";
  } catch {
    return "unknown";
  }
}

/* ────────────────────────── throttle helpers ────────────────────────── */

async function checkLockout(key: string): Promise<number | undefined> {
  const { loginAttempts } = await getCollections();
  const record = await loginAttempts.findOne({ key });
  if (record?.lockedUntil === undefined) return undefined;
  const remainingMs = record.lockedUntil.getTime() - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : undefined;
}

async function recordFailure(key: string): Promise<void> {
  const { loginAttempts } = await getCollections();
  const now = new Date();
  const existing = await loginAttempts.findOne({ key });

  // A stale window starts over rather than accumulating forever.
  const windowExpired =
    existing !== null && now.getTime() - existing.firstFailureAt.getTime() > ATTEMPT_WINDOW_MS;
  const failures = existing === null || windowExpired ? 1 : existing.failures + 1;

  const tier = LOCKOUT_TIERS.find((t) => failures >= t.failures);
  const lockedUntil = tier === undefined ? undefined : new Date(now.getTime() + tier.lockMs);

  await loginAttempts.updateOne(
    { key },
    {
      $set: {
        key,
        failures,
        firstFailureAt: existing === null || windowExpired ? now : existing.firstFailureAt,
        updatedAt: now,
        // Counter self-destructs well after the longest lockout could end.
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        ...(lockedUntil !== undefined ? { lockedUntil } : {}),
      },
    },
    { upsert: true },
  );
}

async function clearFailures(key: string): Promise<void> {
  const { loginAttempts } = await getCollections();
  await loginAttempts.deleteOne({ key });
}

/* ────────────────────────── login ────────────────────────── */

export async function loginCitizen(rawInput: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(rawInput);

  // Malformed input is indistinguishable from bad credentials to the client.
  // A throttle key is still needed, so fall back to the raw mobile digits.
  const fallbackKey = ((): string => {
    const value = (rawInput as { mobile?: unknown } | null)?.mobile;
    return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 15) : "unparseable";
  })();
  const throttleKey = parsed.success ? parsed.data.mobile : fallbackKey;

  try {
    const locked = await checkLockout(throttleKey);
    if (locked !== undefined) {
      await recordAuditEvent({
        type: "LOGIN_FAILURE",
        actor: { kind: "CITIZEN_SELF" },
        subject: { kind: "AUTHENTICATION" },
        metadata: {
          reason: "locked_out",
          retryAfterSeconds: locked,
          ipHint: requestIpHint(),
          ...(parsed.success ? { mobileMasked: maskMobile(parsed.data.mobile) } : {}),
        },
      });
      return { ok: false, error: "account_locked", retryAfterSeconds: locked };
    }

    if (!parsed.success) {
      await recordFailure(throttleKey);
      await recordAuditEvent({
        type: "LOGIN_FAILURE",
        actor: { kind: "CITIZEN_SELF" },
        subject: { kind: "AUTHENTICATION" },
        metadata: { reason: "malformed_input", ipHint: requestIpHint() },
      });
      return { ok: false, error: "invalid_credentials" };
    }

    const { mobile, mpin } = parsed.data;
    const { citizens } = await getCollections();
    const citizen = await citizens.findOne({ mobile });

    // Decoy verify keeps the unknown-account path the same cost as a real one.
    if (citizen === null) {
      await verifyMpin(mpin, await getDecoyHash());
      await recordFailure(throttleKey);
      await recordAuditEvent({
        type: "LOGIN_FAILURE",
        actor: { kind: "CITIZEN_SELF" },
        subject: { kind: "AUTHENTICATION" },
        metadata: {
          reason: "no_such_account",
          mobileMasked: maskMobile(mobile),
          ipHint: requestIpHint(),
        },
      });
      return { ok: false, error: "invalid_credentials" };
    }

    const mpinValid = await verifyMpin(mpin, citizen.mpinHash);
    if (!mpinValid) {
      await recordFailure(throttleKey);
      await recordAuditEvent({
        type: "LOGIN_FAILURE",
        actor: { kind: "CITIZEN_SELF" },
        subject: { kind: "AUTHENTICATION", citizenId: citizen._id.toHexString() },
        metadata: {
          reason: "bad_mpin",
          mobileMasked: maskMobile(mobile),
          ipHint: requestIpHint(),
        },
      });
      return { ok: false, error: "invalid_credentials" };
    }

    // Inactive accounts get the same generic message so the response cannot be
    // used to confirm that a number is registered. The real reason is audited.
    if (citizen.active !== true) {
      await recordFailure(throttleKey);
      await recordAuditEvent({
        type: "LOGIN_FAILURE",
        actor: { kind: "CITIZEN_SELF" },
        subject: { kind: "AUTHENTICATION", citizenId: citizen._id.toHexString() },
        metadata: {
          reason: "account_inactive",
          mobileMasked: maskMobile(mobile),
          ipHint: requestIpHint(),
        },
      });
      return { ok: false, error: "invalid_credentials" };
    }

    const citizenId = citizen._id.toHexString();
    // Role comes from the document, never from the request.
    await createSession({ citizenId, role: citizen.role });
    await clearFailures(throttleKey);

    await recordAuditEvent({
      type: "LOGIN_SUCCESS",
      actor: { kind: "CITIZEN_SELF", citizenId },
      subject: { kind: "AUTHENTICATION", citizenId },
      metadata: {
        mobileMasked: maskMobile(mobile),
        role: citizen.role,
        ipHint: requestIpHint(),
      },
    });

    return {
      ok: true,
      user: {
        citizenId,
        fullName: citizen.fullName,
        role: citizen.role,
        mobileMasked: maskMobile(mobile),
      },
    };
  } catch (error: unknown) {
    return { ok: false, error: mapUnexpectedError(error, "loginCitizen") };
  }
}

/* ────────────────────────── logout ────────────────────────── */

/** Idempotent: succeeds whether or not a valid session was present. */
export async function logoutCitizen(): Promise<LogoutResult> {
  try {
    const revoked = await destroyCurrentSession();
    if (revoked !== undefined) {
      await recordAuditEvent({
        type: "LOGOUT",
        actor: { kind: "CITIZEN_SELF", citizenId: revoked.citizenId },
        subject: {
          kind: "AUTHENTICATION",
          citizenId: revoked.citizenId,
          sessionId: revoked.sessionId,
        },
        metadata: { ipHint: requestIpHint() },
      });
    }
  } catch (error: unknown) {
    // The cookie is cleared regardless, so report success to the citizen.
    mapUnexpectedError(error, "logoutCitizen");
  }
  return { ok: true };
}

/* ────────────────────────── current user ────────────────────────── */

/** Returns the signed-in user, or null. Safe to call anonymously. */
export async function currentUser(): Promise<AuthenticatedUser | null> {
  try {
    return (await getOptionalUser()) ?? null;
  } catch (error: unknown) {
    mapUnexpectedError(error, "currentUser");
    return null;
  }
}
