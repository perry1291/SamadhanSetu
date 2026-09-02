/**
 * Reads the signed-in citizen from the root route's loader.
 *
 * The root loader resolves the session server-side from the HttpOnly cookie, so
 * this is the single client-side source of session truth. There is no separate
 * auth store to drift out of sync: `router.invalidate()` after login or logout
 * refreshes every consumer.
 *
 * Returns `null` when anonymous. Client-side checks based on this are for UX
 * only — every protected server function independently calls `requireCitizen()`.
 */
import { useLoaderData } from "@tanstack/react-router";

import type { AuthenticatedUser } from "./auth-api";

export function useOptionalUser(): AuthenticatedUser | null {
  return useLoaderData({ from: "__root__", select: (data) => data.user });
}
