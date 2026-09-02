/**
 * TanStack Start server functions for citizen registration.
 *
 * This is the ONLY bridge between the browser and the registration logic. The
 * route component imports from here and never touches MongoDB.
 *
 * Why dynamic `import()` inside each handler rather than a top-level import:
 * this module is imported by a client component, so it exists in the client
 * module graph. The server-only modules it depends on carry the
 * `@tanstack/react-start/server-only` marker, and a static import would place
 * them in that graph too. Importing them inside the handler body keeps the
 * driver, the crypto helpers and MONGO_URL_SIH access strictly server-side.
 * Node caches the module after the first call, so the cost is one-time.
 *
 * All validation and every security decision happens in
 * `server/registration.server.ts`. These wrappers deliberately add no logic of
 * their own beyond passing the raw payload through, so the client cannot reach
 * a code path that skips a check.
 */
import { createServerFn } from "@tanstack/react-start";

import type {
  CompleteResult,
  ResendResult,
  StartResult,
  VerifyResult,
} from "./server/registration.server";

/**
 * Step 1. Validates the details server-side, creates a pending registration and
 * asks the OTP provider to deliver a code.
 *
 * Returns a challenge id, a masked mobile and the true delivery status. Never
 * returns the OTP, and never creates a citizen record.
 */
export const startRegistrationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<StartResult> => {
    const { startRegistration } = await import("./server/registration.server");
    return startRegistration(data);
  });

/** Step 2a. Issues a fresh code, subject to the server-side resend limit. */
export const resendOtpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<ResendResult> => {
    const { resendOtp } = await import("./server/registration.server");
    const challengeId = (data as { challengeId?: unknown } | null)?.challengeId;
    return resendOtp(challengeId);
  });

/**
 * Step 2b. Verifies the code against the stored hash under expiry and attempt
 * limits. On success returns a single-use verification token, which is the
 * proof required by step 3.
 */
export const verifyOtpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<VerifyResult> => {
    const { verifyRegistrationOtp } = await import("./server/registration.server");
    return verifyRegistrationOtp(data);
  });

/**
 * Step 3. Requires the verification token, hashes the MPIN and creates the
 * citizen with a server-assigned role. Returns only a masked mobile.
 */
export const completeRegistrationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<CompleteResult> => {
    const { completeRegistration } = await import("./server/registration.server");
    return completeRegistration(data);
  });
