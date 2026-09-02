/**
 * Shared logout action for the header.
 *
 * Kept in one place because logout is not just a request: the session cookie is
 * HttpOnly, so the only way the client learns it is gone is by re-running the
 * root loader. `invalidate()` does that, which refreshes the navigation and any
 * session-derived data before returning to the public landing page.
 */
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { logoutFn } from "./auth-api";

export function useLogout(): { logout: () => Promise<void>; busy: boolean } {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await logoutFn();
      await router.invalidate();
      await router.navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  }

  return { logout, busy };
}
