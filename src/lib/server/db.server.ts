/**
 * Server-only MongoDB connection module.
 *
 * SECURITY CONTRACT — read before editing:
 *
 *  1. The connection string lives ONLY in `process.env.MONGO_URL_SIH`. It is
 *     never read via `import.meta.env` (which Vite can inline into bundles) and
 *     is never prefixed with `VITE_` (which would publish it to the browser).
 *  2. This module must never be imported from a component, route component, or
 *     any other browser-reachable module. Two guards enforce that:
 *       - the `@tanstack/react-start/server-only` marker import below, which
 *         makes the import-protection plugin fail the build on client import;
 *       - the `.server.ts` filename suffix, the convention this project's
 *         eslint config points at (see `no-restricted-imports` in
 *         eslint.config.js).
 *  3. Nothing here logs the URI, the credentials, or raw driver errors. Driver
 *     errors routinely embed hostnames and sometimes userinfo, so failures are
 *     reduced to an error name plus code for server logs, and callers receive a
 *     generic `DatabaseUnavailableError`.
 *  4. The `MongoClient` is not exported. Callers get a `Db` handle instead, so
 *     no consumer can reach into connection internals or read back the URI via
 *     `client.options`.
 */
import "@tanstack/react-start/server-only";

import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

/** Environment variable holding the Atlas connection string. Server-side only. */
const ENV_KEY = "MONGO_URL_SIH";

/**
 * The `MONGO_URL_SIH` URI intentionally specifies no default database, so the
 * database name is supplied here rather than embedded in the secret. Callers may
 * override it per call; no collection is created or written by this module.
 */
export const DEFAULT_DB_NAME = "samadhansetu";

/**
 * Dev-only fallback env files, highest precedence first. In production the
 * hosting platform injects real environment variables and these are absent.
 */
const DEV_ENV_FILES = [".env.local", ".env"] as const;

const CLIENT_OPTIONS: MongoClientOptions = {
  // Fail fast instead of hanging a request when the cluster is unreachable.
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 10_000,
  // Pooling is handled by the driver; the client below is cached so that the
  // pool is shared across requests rather than rebuilt per invocation.
  maxPoolSize: 10,
  minPoolSize: 0,
  retryWrites: true,
  appName: "samadhansetu",
};

/** Raised for every failure path. Deliberately carries no connection detail. */
export class DatabaseUnavailableError extends Error {
  constructor(message = "Database is unavailable.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * Reduces an unknown error to a non-sensitive descriptor.
 *
 * `error.message` is deliberately excluded: MongoDB server-selection and
 * authentication errors embed the cluster hostname and can embed userinfo from
 * the URI. Only the constructor name and driver code are considered safe.
 */
function describeSafely(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  const { code } = error as { code?: unknown };
  const suffix =
    typeof code === "string" || typeof code === "number" ? ` (code ${String(code)})` : "";
  return `${error.name}${suffix}`;
}

/**
 * Resolves the connection string.
 *
 * Order: real process env first, then dev env files via Node's native
 * `process.loadEnvFile`. Each candidate file is probed in turn and the search
 * stops at the first hit, so `.env.local` keeps precedence over `.env`. The
 * value itself is never logged or returned in an error.
 */
function readConnectionString(): string {
  const fromProcess = process.env[ENV_KEY];
  if (fromProcess !== undefined && fromProcess.trim() !== "") return fromProcess.trim();

  // `process.loadEnvFile` is Node >= 20.12 and absent on edge runtimes.
  if (typeof process.loadEnvFile === "function") {
    for (const file of DEV_ENV_FILES) {
      try {
        // Relative paths resolve against cwd, which is the Vite project root.
        process.loadEnvFile(file);
      } catch {
        // Absent or unreadable file is the normal production case. The path is
        // intentionally not reported.
      }
      const loaded = process.env[ENV_KEY];
      if (loaded !== undefined && loaded.trim() !== "") return loaded.trim();
    }
  }

  throw new DatabaseUnavailableError(
    `Missing required server environment variable ${ENV_KEY}. ` +
      `Copy .env.example to .env.local and set it.`,
  );
}

interface MongoConnectionCache {
  client: MongoClient | undefined;
  promise: Promise<MongoClient> | undefined;
}

/**
 * The cache is parked on `globalThis` so a single client survives dev-server
 * HMR module re-evaluation. Without this, every edit would leak a connection
 * pool and Atlas would eventually refuse new connections.
 */
type GlobalWithMongoCache = typeof globalThis & {
  __samadhansetu_mongo__?: MongoConnectionCache;
};

function getCache(): MongoConnectionCache {
  const scope = globalThis as GlobalWithMongoCache;
  scope.__samadhansetu_mongo__ ??= { client: undefined, promise: undefined };
  return scope.__samadhansetu_mongo__;
}

/**
 * Returns the shared connected client, creating it at most once.
 *
 * The in-flight promise is cached too, so concurrent callers during cold start
 * share one connection attempt. On failure the cache is cleared so a later
 * request can retry rather than being stuck with a rejected promise.
 */
function connect(): Promise<MongoClient> {
  const cache = getCache();
  if (cache.client !== undefined) return Promise.resolve(cache.client);
  if (cache.promise !== undefined) return cache.promise;

  // Throws DatabaseUnavailableError synchronously if the env var is missing.
  const uri = readConnectionString();
  const client = new MongoClient(uri, CLIENT_OPTIONS);

  cache.promise = client
    .connect()
    .then((connected) => {
      cache.client = connected;
      cache.promise = undefined;
      return connected;
    })
    .catch((error: unknown) => {
      cache.promise = undefined;
      cache.client = undefined;
      // Release the half-open client; ignore secondary close failures.
      void client.close(true).catch(() => undefined);
      // Safe descriptor only — never the URI, message, or stack.
      console.error(`[db] MongoDB connection failed: ${describeSafely(error)}`);
      throw new DatabaseUnavailableError();
    });

  return cache.promise;
}

/**
 * Server-only accessor for a database handle.
 *
 * @param name Database name; defaults to {@link DEFAULT_DB_NAME}.
 * @throws {DatabaseUnavailableError} if the env var is missing or connection fails.
 */
export async function getDb(name: string = DEFAULT_DB_NAME): Promise<Db> {
  const client = await connect();
  return client.db(name);
}

/**
 * Round-trips a `ping` command to confirm the app can reach MongoDB.
 * Resolves on success; throws {@link DatabaseUnavailableError} otherwise.
 */
export async function pingDatabase(): Promise<void> {
  const db = await getDb();
  try {
    await db.command({ ping: 1 });
  } catch (error: unknown) {
    console.error(`[db] MongoDB ping failed: ${describeSafely(error)}`);
    throw new DatabaseUnavailableError();
  }
}

/** Closes the shared client and clears the cache. For shutdown and tests. */
export async function closeDatabase(): Promise<void> {
  const cache = getCache();
  const existing = cache.client;
  cache.client = undefined;
  cache.promise = undefined;
  if (existing !== undefined) {
    try {
      await existing.close();
    } catch (error: unknown) {
      console.error(`[db] MongoDB close failed: ${describeSafely(error)}`);
    }
  }
}
