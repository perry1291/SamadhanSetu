/**
 * Server-only cryptographic helpers.
 *
 * Uses WebCrypto (`globalThis.crypto.subtle`) rather than `node:crypto` so the
 * same code runs under Node and edge runtimes without a compatibility shim.
 *
 * Design notes:
 *  - PBKDF2-HMAC-SHA256 with a random per-record salt. An MPIN has only 10^6
 *    possible values, so a deliberately expensive KDF is what makes an offline
 *    guessing attack against a leaked database costly. A fast hash (SHA-256,
 *    MD5) or a shared salt would be effectively reversible here.
 *  - Iteration count is stored inside the encoded string, so it can be raised
 *    later without invalidating existing records.
 *  - Comparison is constant-time to avoid leaking a prefix match through timing.
 */
import "@tanstack/react-start/server-only";

/** OWASP-aligned floor for PBKDF2-HMAC-SHA256. Applied to MPINs. */
const MPIN_ITERATIONS = 210_000;

/**
 * OTPs live for minutes and are rate-limited and attempt-limited, so the threat
 * model is far weaker than for a reusable credential. A lower cost keeps
 * verification responsive while still avoiding plaintext storage.
 */
const OTP_ITERATIONS = 60_000;

const SALT_BYTES = 16;
const DERIVED_BITS = 256;
const ENCODING_VERSION = "pbkdf2-sha256";

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    DERIVED_BITS,
  );
  return new Uint8Array(bits);
}

/** Length-independent, content constant-time byte comparison. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Encodes as `pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>`.
 * Self-describing, so verification needs no external parameter table.
 */
async function hash(secret: string, iterations: number): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derive(secret, salt, iterations);
  return `${ENCODING_VERSION}$${iterations}$${toBase64(salt)}$${toBase64(derived)}`;
}

async function verify(secret: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  const [version, iterationsRaw, saltB64, expectedB64] = parts as [string, string, string, string];
  if (version !== ENCODING_VERSION) return false;

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isSafeInteger(iterations) || iterations <= 0) return false;

  try {
    const derived = await derive(secret, fromBase64(saltB64), iterations);
    return constantTimeEqual(derived, fromBase64(expectedB64));
  } catch {
    // Malformed stored value: fail closed rather than throwing to the caller.
    return false;
  }
}

/** Hashes an MPIN for storage. The plaintext MPIN is never persisted. */
export function hashMpin(mpin: string): Promise<string> {
  return hash(mpin, MPIN_ITERATIONS);
}

export function verifyMpin(mpin: string, encoded: string): Promise<boolean> {
  return verify(mpin, encoded);
}

/** Hashes an OTP so the challenge document holds no usable code. */
export function hashOtp(otpCode: string): Promise<string> {
  return hash(otpCode, OTP_ITERATIONS);
}

export function verifyOtpHash(otpCode: string, encoded: string): Promise<boolean> {
  return verify(otpCode, encoded);
}

/**
 * Cryptographically uniform 6-digit OTP.
 *
 * Rejection sampling avoids the modulo bias that `random % 1000000` would
 * introduce, which would make some codes measurably likelier than others.
 */
export function generateOtpCode(): string {
  const limit = 1_000_000;
  const maxAcceptable = Math.floor(0xffffffff / limit) * limit;
  for (;;) {
    const [value] = crypto.getRandomValues(new Uint32Array(1)) as unknown as [number];
    if (value < maxAcceptable) return String(value % limit).padStart(6, "0");
  }
}

/** Opaque high-entropy identifier for challenge IDs and verification tokens. */
export function generateOpaqueToken(bytes = 32): string {
  return Array.from(randomBytes(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Hashes a verification token before storage, same reasoning as the OTP. */
export function hashToken(token: string): Promise<string> {
  return hash(token, OTP_ITERATIONS);
}

export function verifyToken(token: string, encoded: string): Promise<boolean> {
  return verify(token, encoded);
}
