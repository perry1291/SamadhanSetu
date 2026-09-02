/**
 * Server-only database health check.
 *
 * Deliberately NOT an HTTP route or a server function. Authentication does not
 * exist in this codebase yet, so publishing a reachable endpoint that probes
 * infrastructure would be exposing it publicly. Instead this is a plain
 * server-only function plus the `npm run db:health` CLI script, giving
 * developers connectivity verification with no public surface.
 *
 * When authentication lands and this is wired to an officer/admin route, keep
 * the production gate below and add an authorization check at the call site.
 *
 * The returned shape never carries a URI, credentials, database secrets, or a
 * raw driver error — only a coarse status.
 */
import "@tanstack/react-start/server-only";

// Explicit .ts extension so this module also resolves under plain Node ESM for
// the `npm run db:health` script. Permitted by `allowImportingTsExtensions`.
import { DatabaseUnavailableError, pingDatabase } from "./db.server.ts";

export type DatabaseHealth =
  | { readonly ok: true; readonly database: "connected" }
  | { readonly ok: false; readonly database: "unavailable" }
  | { readonly ok: false; readonly database: "disabled" };

/**
 * `NODE_ENV` is used rather than `import.meta.env` so this behaves identically
 * inside the Vite/Nitro server runtime and under the plain Node CLI script.
 * Neither value is a secret.
 */
function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * Confirms the application can open a MongoDB connection and round-trip a
 * `ping`. Never throws; failures are collapsed into a status value so callers
 * cannot accidentally surface driver internals.
 *
 * Inert in production (`{ ok: false, database: "disabled" }`) until an
 * authenticated caller exists.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  if (isProduction()) return { ok: false, database: "disabled" };

  try {
    await pingDatabase();
    return { ok: true, database: "connected" };
  } catch (error: unknown) {
    // `db.server.ts` has already logged a redacted descriptor. Assert the
    // expected type so an unexpected error class is not silently swallowed.
    if (!(error instanceof DatabaseUnavailableError)) {
      console.error("[health] Unexpected non-database error during health check.");
    }
    return { ok: false, database: "unavailable" };
  }
}
