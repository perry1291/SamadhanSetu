/**
 * Development CLI: verify the app can reach MongoDB.
 *
 *   npm run db:health
 *
 * Prints only the coarse health status. Never prints the connection string,
 * credentials, or raw driver errors. Exits 1 when the database is unreachable
 * so it can be used as a precondition in local workflows.
 */
// Explicit .ts extensions: this script runs under plain Node ESM (not the Vite
// bundler), which requires them. Permitted by `allowImportingTsExtensions`.
import { closeDatabase } from "../src/lib/server/db.server.ts";
import { checkDatabaseHealth } from "../src/lib/server/health.server.ts";

async function main(): Promise<void> {
  const health = await checkDatabaseHealth();
  console.log(JSON.stringify(health));

  if (health.database === "disabled") {
    console.error("Health check is disabled when NODE_ENV=production.");
  } else if (!health.ok) {
    console.error(
      "Could not reach MongoDB. Check that MONGO_URL_SIH is set in .env.local " +
        "and that this machine's IP is allowed in the Atlas network access list.",
    );
  }

  await closeDatabase();
  process.exitCode = health.ok ? 0 : 1;
}

await main();
