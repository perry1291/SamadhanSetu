/**
 * Server-only session store and authorization guards.
 *
 * Design:
 *  - The session cookie is `HttpOnly`, so client JavaScript cannot read it. No
 *    token is ever placed in localStorage, sessionStorage or a URL.
 *  - Sessions are stored in MongoDB, so logout revokes access server-side. A
 *    purely stateless signed cookie could not be invalidated before expiry.
 *  - Selector/verifier: the cookie is `<sessionId>.<secret>`. `sessionId` is an
 *    indexed, non-secret lookup key; only a PBKDF2 hash of `secret` is stored.
 *    A database leak yields no usable cookie, and lookup is one indexed query.
 *  - Identity is always re-read from the `citizens` document on each request, so
 *    a deactivated account loses access immediately rather than at cookie expiry,
 *    and role can never be taken from client input.
 */
import "@tanstack/react-start/server-only";

import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { getCollections, type CitizenDocument, type UserRole } from "./collections.server";
import { generateOpaqueToken, hashToken, verifyToken } from "./crypto.server";

export const SESSION_COOKIE = "samadhansetu_session";

/** Absolute lifetime. Sessions are not extended indefinitely by activity. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** `lastSeenAt` is only rewritten after this long, to avoid a write per request. */
const LAST_SEEN_REFRESH_MS = 15 * 60 * 1000;

function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * The safe projection of an authenticated citizen.
 *
 * Deliberately excludes `mpinHash`, and excludes address/email/phone because no
 * current screen needs them. Widen only where a feature genuinely requires it.
 */
export interface AuthenticatedUser {
  citizenId: string;
  fullName: string;
  role: UserRole;
  mobileMasked: string;
}

function maskMobile(mobile: string): string {
  if (mobile.length !== 10) return "••••••••••";
  return `${mobile.slice(0, 2)}•••••${mobile.slice(7)}`;
}

function toAuthenticatedUser(
  citizen: CitizenDocument & { _id: { toHexString(): string } },
): AuthenticatedUser {
  return {
    citizenId: citizen._id.toHexString(),
    fullName: citizen.fullName,
    role: citizen.role,
    mobileMasked: maskMobile(citizen.mobile),
  };
}

/**
 * Issues a session and sets the cookie. Called only after credentials have
 * already been verified.
 */
export async function createSession(input: { citizenId: string; role: UserRole }): Promise<void> {
  const { sessions } = await getCollections();
  const now = new Date();
  const sessionId = generateOpaqueToken(16);
  const secret = generateOpaqueToken(32);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await sessions.insertOne({
    sessionId,
    secretHash: await hashToken(secret),
    citizenId: input.citizenId,
    role: input.role,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });

  setCookie(SESSION_COOKIE, `${sessionId}.${secret}`, {
    httpOnly: true,
    // Only sent over TLS in production; plain http is needed for local dev.
    secure: isProduction(),
    // Lax keeps the cookie on top-level navigation after the post-login redirect
    // while still blocking cross-site form posts. CSRF middleware covers serverFn.
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Splits the cookie into its selector and verifier halves. */
function parseCookieValue(raw: string): { sessionId: string; secret: string } | undefined {
  const separator = raw.indexOf(".");
  if (separator <= 0 || separator === raw.length - 1) return undefined;
  return { sessionId: raw.slice(0, separator), secret: raw.slice(separator + 1) };
}

/**
 * Resolves the current user from the cookie, or `undefined` when there is no
 * valid session. Never throws for an anonymous visitor.
 */
export async function getOptionalUser(): Promise<AuthenticatedUser | undefined> {
  const raw = getCookie(SESSION_COOKIE);
  if (raw === undefined || raw === "") return undefined;

  const parsed = parseCookieValue(raw);
  if (parsed === undefined) return undefined;

  const { sessions, citizens } = await getCollections();
  const session = await sessions.findOne({ sessionId: parsed.sessionId });
  if (session === null) return undefined;
  if (session.revokedAt !== undefined) return undefined;
  // TTL removal is lazy, so expiry is also checked explicitly.
  if (session.expiresAt.getTime() <= Date.now()) return undefined;

  // Constant-time verification of the cookie secret.
  if (!(await verifyToken(parsed.secret, session.secretHash))) return undefined;

  // Identity and role come from the citizen record, never from the cookie.
  const { ObjectId } = await import("mongodb");
  let citizen: CitizenDocument | null = null;
  try {
    citizen = await citizens.findOne({ _id: new ObjectId(session.citizenId) });
  } catch {
    // Malformed stored id: treat as no session rather than throwing.
    return undefined;
  }
  if (citizen === null || citizen.active !== true) return undefined;

  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
    await sessions.updateOne(
      { sessionId: session.sessionId },
      { $set: { lastSeenAt: new Date() } },
    );
  }

  return toAuthenticatedUser(citizen as CitizenDocument & { _id: { toHexString(): string } });
}

/** Thrown by the guards. Callers map this to a generic client-safe response. */
export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Not permitted.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Requires any authenticated user. Use in every protected server function. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getOptionalUser();
  if (user === undefined) throw new UnauthorizedError();
  return user;
}

/** Requires an authenticated user whose server-side role is CITIZEN. */
export async function requireCitizen(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== "CITIZEN") throw new ForbiddenError();
  return user;
}

/**
 * Revokes the current session server-side and clears the cookie.
 * Returns the revoked session id for auditing, when there was one.
 */
export async function destroyCurrentSession(): Promise<
  { citizenId: string; sessionId: string } | undefined
> {
  const raw = getCookie(SESSION_COOKIE);
  // Always clear the cookie, even if the session was already gone.
  deleteCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
  });
  if (raw === undefined || raw === "") return undefined;

  const parsed = parseCookieValue(raw);
  if (parsed === undefined) return undefined;

  const { sessions } = await getCollections();
  const session = await sessions.findOne({ sessionId: parsed.sessionId });
  if (session === null) return undefined;
  // Verify before revoking so a guessed sessionId cannot log someone else out.
  if (!(await verifyToken(parsed.secret, session.secretHash))) return undefined;

  await sessions.deleteOne({ sessionId: parsed.sessionId });
  return { citizenId: session.citizenId, sessionId: session.sessionId };
}
