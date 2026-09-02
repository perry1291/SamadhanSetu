/**
 * Login validation — shared by client and server, authoritative on the server.
 *
 * Reuses the registration feature's `normalizeMobile` so `+91 98765 43210` and
 * `9876543210` resolve to the same stored value, and reuses the `ErrorCode` type
 * so every message has EN and HI text.
 *
 * Note the deliberate asymmetry with registration: the MPIN here is only checked
 * for shape (6 digits). It is NOT run through the weak-MPIN rules, because those
 * exist to stop a citizen *choosing* a guessable PIN. Applying them at login
 * would reject a pre-existing account and, worse, let an attacker distinguish
 * "weak PIN" from "wrong PIN".
 */
import { z } from "zod";

import { normalizeMobile, type ErrorCode } from "./registration";

const code = (value: ErrorCode): { message: ErrorCode } => ({ message: value });

export const loginSchema = z.object({
  mobile: z
    .string()
    .trim()
    .transform((value) => normalizeMobile(value))
    .refine((value): value is string => value !== undefined, code("invalid_credentials")),
  mpin: z.string().regex(/^\d{6}$/, code("invalid_credentials")),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Raw shape the login form binds to. */
export interface LoginFormValues {
  mobile: string;
  mpin: string;
}
