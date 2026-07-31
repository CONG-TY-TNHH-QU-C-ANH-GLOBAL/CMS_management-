// Narrow connection port for the content data plane. The repository depends ONLY on `PgExec`, so the
// same code runs against PGlite (local POC/tests) and against Supabase Postgres via Hyperdrive at
// runtime. No credential is ever logged; connection strings live only in the Worker env/binding.
import { ContentError } from "./content.errors";

export interface PgExec {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run `fn` inside a single bounded transaction. */
  tx<T>(fn: (exec: PgExec) => Promise<T>): Promise<T>;
}

// ── PGlite adapter (local POC + tests) — real PostgreSQL in-process, no server ───────────────────
interface PgliteQueryable {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
interface PgliteDb extends PgliteQueryable {
  transaction<T>(fn: (tx: PgliteQueryable) => Promise<T>): Promise<T>;
}
export function pgliteExec(db: PgliteDb): PgExec {
  // Inside an existing transaction the handle has only `query`; a nested tx() flattens onto it.
  const fromQueryable = (h: PgliteQueryable): PgExec => ({
    query: async <T>(text: string, params: unknown[] = []) => (await h.query<T>(text, params)).rows,
    tx: (fn) => fn(fromQueryable(h)),
  });
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await db.query<T>(text, params)).rows,
    tx: (fn) => db.transaction((t) => fn(fromQueryable(t))),
  };
}

// ── postgres.js runtime adapter (Worker → Hyperdrive → Supabase Postgres) ────────────────────────
// Validated configuration code. Not exercised by the PGlite POC (no cloud creds); the production path
// uses these exact settings. Hyperdrive already pools — we do NOT stack a second pooler.
interface SqlLike {
  unsafe<T>(text: string, params?: unknown[]): Promise<T[]>;
  begin<T>(fn: (sql: SqlLike) => Promise<T>): Promise<T>;
}
export function postgresExec(sql: SqlLike): PgExec {
  const wrap = (s: SqlLike): PgExec => ({
    query: (text, params = []) => s.unsafe(text, params),
    tx: (fn) => s.begin((t) => fn(wrap(t))),
  });
  return wrap(sql);
}

export interface RuntimeEnv {
  /** Cloudflare Hyperdrive binding (preferred): pooled, low-latency access to the direct PG endpoint. */
  HYPERDRIVE?: { connectionString: string };
  /** Local/dev fallback (never in production). */
  DATABASE_URL?: string;
}

/** Lazily build the runtime `postgres.js` client. Import is dynamic so PGlite-only paths never load it.
 *  `max:1` because Hyperdrive owns pooling; prepared statements are Hyperdrive-compatible. */
export async function createRuntimeExec(env: RuntimeEnv): Promise<PgExec> {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!connectionString)
    throw new ContentError("db_unavailable", "no database connection configured");
  const { default: postgres } = await import("postgres");
  const sql = postgres(connectionString, {
    max: 1,
    prepare: true,
    idle_timeout: 20,
    connect_timeout: 10,
    fetch_types: false,
  });
  return postgresExec(sql as unknown as SqlLike);
}

/** Secret-free health probe (maps any failure to a bounded error state). */
export async function healthCheck(exec: PgExec): Promise<{ ok: boolean }> {
  try {
    await exec.query("SELECT 1");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
