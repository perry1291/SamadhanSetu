/**
 * Audit trail writer for the `audit_events` collection.
 *
 * Properties this establishes:
 *  - append-only: callers can insert, nothing here updates or deletes
 *  - server clock only: `at` is set here, never taken from a request
 *  - structured: `type` is a closed union, not free text, so events are queryable
 *  - minimal: metadata carries no MPIN, MPIN hash, OTP, OTP hash, name, email,
 *    address or unmasked mobile
 *
 * Audit writes must never break the citizen-facing flow, so failures are logged
 * and swallowed rather than propagated.
 */
import "@tanstack/react-start/server-only";

import { getCollections, type AuditEventDocument, type AuditEventType } from "./collections.server";

/** Values permitted in metadata. Keeps accidental PII objects out by typing. */
export type AuditMetadata = Record<string, string | number | boolean>;

export interface RecordAuditInput {
  type: AuditEventType;
  actor?: AuditEventDocument["actor"];
  subject: AuditEventDocument["subject"];
  metadata?: AuditMetadata;
}

/**
 * Keys that must never reach the audit collection even if a caller passes them.
 * A defensive net: the type system already discourages it, this enforces it.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  "mpin",
  "mpinhash",
  "confirmmpin",
  "otp",
  "otpcode",
  "otphash",
  "verificationtoken",
  "verificationtokenhash",
  "password",
  "mobile",
  "email",
  "fullname",
  "address",
]);

function sanitizeMetadata(metadata: AuditMetadata | undefined): AuditMetadata {
  if (metadata === undefined) return {};
  const safe: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
    safe[key] = value;
  }
  return safe;
}

export async function recordAuditEvent(input: RecordAuditInput): Promise<void> {
  try {
    const { auditEvents } = await getCollections();
    await auditEvents.insertOne({
      type: input.type,
      at: new Date(),
      actor: input.actor ?? { kind: "SYSTEM" },
      subject: input.subject,
      metadata: sanitizeMetadata(input.metadata),
    });
  } catch (error: unknown) {
    // Name only; driver messages can embed connection detail.
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[audit] Failed to record ${input.type}: ${name}`);
  }
}
