/**
 * TanStack Start server functions for citizen authentication.
 *
 * The only bridge between the browser and the auth logic. As in
 * `registration-api.ts`, the server modules are pulled in with a dynamic
 * `import()` inside each handler: this module lives in the client graph, and a
 * static import would drag the MongoDB driver, the crypto helpers and
 * MONGO_URL_SIH access in with it.
 *
 * Note what is absent: no function accepts a citizenId, userId or role. Identity
 * comes exclusively from the HttpOnly session cookie, resolved server-side.
 */
import { createServerFn } from "@tanstack/react-start";

import type { LoginResult, LogoutResult } from "./server/auth.server";
import type { AuthenticatedUser } from "./server/session.server";

/**
 * Re-exported so client components can type the session without importing a
 * server-only module. Type-only, so nothing is emitted into the client bundle.
 */
export type { AuthenticatedUser };

/**
 * Verifies mobile + MPIN and, on success, sets the session cookie.
 * Returns a generic failure for every rejection reason.
 */
export const loginFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<LoginResult> => {
    const { loginCitizen } = await import("./server/auth.server");
    return loginCitizen(data);
  });

/** Revokes the session server-side and clears the cookie. Idempotent. */
export const logoutFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<LogoutResult> => {
    const { logoutCitizen } = await import("./server/auth.server");
    return logoutCitizen();
  },
);

/**
 * Resolves the signed-in user from the cookie, or null. Used by the shell to
 * render the authenticated header. Takes no input by design.
 */
export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthenticatedUser | null> => {
    const { currentUser } = await import("./server/auth.server");
    return currentUser();
  },
);

/**
 * A protected endpoint, used to demonstrate and test authorization.
 *
 * Goes through `requireCitizen()`, so an anonymous caller is refused and the
 * returned identity is derived from the session rather than from any argument.
 * This is the seam later citizen features (grievance history, profile) hang off.
 */
export const getCitizenAreaFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<
    { ok: true; user: AuthenticatedUser } | { ok: false; error: "unauthorized" | "forbidden" }
  > => {
    const { requireCitizen, ForbiddenError, UnauthorizedError } =
      await import("./server/session.server");
    try {
      return { ok: true, user: await requireCitizen() };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) return { ok: false, error: "unauthorized" };
      if (error instanceof ForbiddenError) return { ok: false, error: "forbidden" };
      throw error;
    }
  },
);
