/**
 * Registration validation — shared by client and server, authoritative on the server.
 *
 * Zod `message` values are stable error CODES, not human sentences. The UI maps
 * a code to `errors.<code>` in the active locale, so a validation failure is
 * automatically translated and the server never ships user-facing prose.
 *
 * `ErrorCode` is derived from the English translation resource, so inventing a
 * code without adding matching EN and HI text is a compile error.
 */
import { z } from "zod";

import type { TranslationResource } from "@/i18n/locales/en";
import { COUNTRY, isValidDistrictFor, isValidStateCode } from "@/lib/locations";

export type ErrorCode = keyof TranslationResource["errors"];

/** Narrow helper so `message:` literals are checked against available codes. */
const code = (value: ErrorCode): { message: ErrorCode } => ({ message: value });

/* ────────────────────────── mobile handling ────────────────────────── */

/**
 * Reduces user input to a bare 10-digit Indian mobile number.
 *
 * Accepts the formats citizens actually type: `+91 98765 43210`,
 * `091-9876543210`, `9876543210`. Returns `undefined` when the result is not a
 * plausible Indian mobile number. Normalisation runs on the server before any
 * uniqueness check so `+919876543210` and `9876543210` cannot both register.
 */
export function normalizeMobile(input: string): string | undefined {
  const digits = input.replace(/\D/g, "");
  // Strip country code (91) or a trunk 0, longest prefix first.
  const local =
    digits.startsWith("91") && digits.length === 12
      ? digits.slice(2)
      : digits.startsWith("0") && digits.length === 11
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : undefined;
}

/** `9876543210` → `98•••••210`. Used in responses and audit metadata. */
export function maskMobile(mobile: string): string {
  if (mobile.length !== 10) return "••••••••••";
  return `${mobile.slice(0, 2)}•••••${mobile.slice(7)}`;
}

/** Optional landline: keeps digits only for storage, tolerant of STD formats. */
export function normalizePhone(input: string): string | undefined {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length > 11 ? digits.slice(2) : digits;
  return local.length >= 8 && local.length <= 12 ? local : undefined;
}

/* ────────────────────────── field schemas ────────────────────────── */

// At least one letter, then letters/marks/space/dot/hyphen/apostrophe.
// \p{L}\p{M} accepts Devanagari and other Indic scripts alongside Latin.
const NAME_PATTERN = /^(?=.*\p{L})[\p{L}\p{M}\s.'-]+$/u;

const fullName = z
  .string()
  .trim()
  .min(2, code("name_invalid"))
  .max(100, code("name_invalid"))
  .regex(NAME_PATTERN, code("name_invalid"));

export const GENDERS = ["MALE", "FEMALE", "TRANSGENDER"] as const;
export type Gender = (typeof GENDERS)[number];

const gender = z.enum(GENDERS, code("gender_invalid"));

const premise = z
  .string()
  .trim()
  .min(1, code("premise_required"))
  .max(100, code("premise_required"));

const subLocality = z.string().trim().max(100, code("sub_locality_invalid")).optional();

const locality = z
  .string()
  .trim()
  .min(1, code("locality_required"))
  .max(100, code("locality_required"));

// Country is fixed for this application; the client cannot widen it.
const country = z.literal(COUNTRY.code, code("country_invalid"));

const state = z.string().trim().refine(isValidStateCode, code("state_invalid"));

const district = z
  .string()
  .trim()
  .min(1, code("district_invalid"))
  .max(100, code("district_invalid"));

// First digit 1-9: no Indian pincode starts with 0.
const pincode = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, code("pincode_invalid"));

const mobile = z
  .string()
  .trim()
  .transform((value) => normalizeMobile(value))
  .refine((value): value is string => value !== undefined, code("mobile_invalid"));

/**
 * Optional fields treat empty string as "not provided" rather than invalid,
 * because a blank optional input is the normal case.
 */
const optionalPhone = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : normalizePhone(value)))
  .refine((value) => value === undefined || value.length >= 8, code("phone_invalid"))
  .optional();

const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value.toLowerCase()))
  .refine(
    (value) => value === undefined || z.string().email().safeParse(value).success,
    code("email_invalid"),
  )
  .refine((value) => value === undefined || value.length <= 254, code("email_invalid"))
  .optional();

/* ────────────────────────── composite schemas ────────────────────────── */

/**
 * Step 1 payload. The State/District relationship is enforced here, so the
 * dependent dropdown on the client is a convenience rather than the control.
 */
export const registrationDetailsSchema = z
  .object({
    fullName,
    gender,
    premise,
    subLocality,
    locality,
    country,
    state,
    district,
    pincode,
    mobile,
    phone: optionalPhone,
    email: optionalEmail,
  })
  .superRefine((value, ctx) => {
    if (!isValidDistrictFor(value.state, value.district)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["district"],
        message: "district_state_mismatch" satisfies ErrorCode,
      });
    }
  });

export type RegistrationDetails = z.infer<typeof registrationDetailsSchema>;

/** Raw shape the form binds to, before normalisation. */
export type RegistrationFormValues = {
  fullName: string;
  gender: Gender | "";
  premise: string;
  subLocality: string;
  locality: string;
  country: string;
  state: string;
  district: string;
  pincode: string;
  mobile: string;
  phone: string;
  email: string;
};

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, code("otp_invalid"));

/* ────────────────────────── MPIN ────────────────────────── */

/** Repeated pairs (121212) and repeated triples (123123). */
const REPEATED_BLOCK = [/^(\d{2})\1{2}$/, /^(\d{3})\1$/];

/** Patterns that are common enough to be guessed regardless of shape. */
const KNOWN_WEAK = new Set([
  "102030",
  "112233",
  "123321",
  "321123",
  "011235",
  "786786",
  "696969",
  "420420",
  "100000",
  "123450",
]);

function isMonotonicRun(mpin: string, step: 1 | -1): boolean {
  for (let i = 1; i < mpin.length; i += 1) {
    const previous = mpin.charCodeAt(i - 1);
    const current = mpin.charCodeAt(i);
    if (current - previous !== step) return false;
  }
  return true;
}

/**
 * Rejects MPINs that are trivial to guess. A 6-digit PIN has only 10^6
 * possibilities, and the small set of predictable ones accounts for a
 * disproportionate share of real-world choices, so they are excluded outright.
 */
export function isWeakMpin(mpin: string): boolean {
  if (/^(\d)\1{5}$/.test(mpin)) return true; // 000000, 111111
  if (isMonotonicRun(mpin, 1)) return true; // 123456, 456789
  if (isMonotonicRun(mpin, -1)) return true; // 654321
  if (REPEATED_BLOCK.some((pattern) => pattern.test(mpin))) return true;
  return KNOWN_WEAK.has(mpin);
}

export const mpinSchema = z
  .string()
  .regex(/^\d{6}$/, code("mpin_invalid"))
  .refine((value) => !isWeakMpin(value), code("mpin_weak"));

export const mpinPairSchema = z
  .object({ mpin: mpinSchema, confirmMpin: z.string() })
  .superRefine((value, ctx) => {
    if (value.mpin !== value.confirmMpin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmMpin"],
        message: "mpin_mismatch" satisfies ErrorCode,
      });
    }
  });

/* ────────────────────────── issue mapping ────────────────────────── */

/**
 * Flattens Zod issues into `{ field: errorCode }` for the form, keeping only the
 * first issue per field so a citizen sees one message at a time per input.
 */
export function toFieldErrors(error: z.ZodError): Record<string, ErrorCode> {
  const result: Record<string, ErrorCode> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";
    if (result[field] === undefined) result[field] = issue.message as ErrorCode;
  }
  return result;
}
