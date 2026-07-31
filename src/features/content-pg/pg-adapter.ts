// Narrow connection port for the content data plane. The repository depends ONLY on `PgExec`, so the
// same code runs against PGlite (local POC/tests) and against Supabase Postgres via Hyperdrive at
// runtime. No credential is ever logged; connection strings live only in the Worker env/binding.
import { ContentError } from "./content.errors";

export interface PgExec {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run `fn` inside a single bounded transaction (a savepoint when already inside one). */
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
  let savepointSeq = 0;
  // Inside an existing transaction the handle has only `query`; a nested tx() opens a REAL SAVEPOINT so
  // an expected error rolls back only the inner work (the outer transaction survives) — matching the
  // postgres.js savepoint semantics.
  const fromQueryable = (h: PgliteQueryable): PgExec => ({
    query: async <T>(text: string, params: unknown[] = []) => (await h.query<T>(text, params)).rows,
    tx: async (fn) => {
      savepointSeq += 1;
      const sp = `sp_${savepointSeq}`;
      await h.query(`SAVEPOINT ${sp}`);
      try {
        const result = await fn(fromQueryable(h));
        await h.query(`RELEASE SAVEPOINT ${sp}`);
        return result;
      } catch (err) {
        await h.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        throw err;
      }
    },
  });
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await db.query<T>(text, params)).rows,
    tx: (fn) => db.transaction((t) => fn(fromQueryable(t))),
  };
}

// ── postgres.js runtime adapter (Worker → Hyperdrive → Supabase Postgres) ────────────────────────
// `begin` starts a real transaction; inside one, `savepoint` nests. `unsafe(...,{prepare:true})` uses
// a prepared statement (Hyperdrive-compatible). Hyperdrive already pools — we do NOT stack a pooler.
interface SqlLike {
  unsafe<T>(text: string, params?: unknown[], options?: { prepare?: boolean }): Promise<T[]>;
  begin<T>(fn: (sql: SqlLike) => Promise<T>): Promise<T>;
  savepoint<T>(fn: (sql: SqlLike) => Promise<T>): Promise<T>;
}
export function postgresExec(sql: SqlLike): PgExec {
  const wrap = (s: SqlLike, inTransaction: boolean): PgExec => ({
    query: (text, params = []) => s.unsafe(text, params, { prepare: true }),
    // Root call opens a transaction; a call already inside one opens a savepoint (true nesting, not a
    // second BEGIN).
    tx: (fn) =>
      inTransaction ? s.savepoint((t) => fn(wrap(t, true))) : s.begin((t) => fn(wrap(t, true))),
  });
  return wrap(sql, false);
}

export interface RuntimeEnv {
  /** Cloudflare Hyperdrive binding (preferred): pooled, low-latency access to the direct PG endpoint. */
  HYPERDRIVE?: { connectionString: string };
  /** Local/dev fallback (never in production). */
  DATABASE_URL?: string;
}

/** Runtime client options — one connection (Hyperdrive owns pooling), prepared statements, and bounded
 *  timeouts so a hung statement or idle-in-transaction session cannot pin a connection. */
export const RUNTIME_CLIENT_OPTIONS = {
  max: 1,
  prepare: true,
  fetch_types: false,
  connect_timeout: 10,
  idle_timeout: 20,
  connection: {
    statement_timeout: 30000, // ms — cap any single statement
    idle_in_transaction_session_timeout: 10000, // ms — release a stuck open transaction
  },
} as const;

type ClosableSql = SqlLike & { end(opts?: { timeout?: number }): Promise<void> };

function connectionStringOf(env: RuntimeEnv): string {
  const cs = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!cs) throw new ContentError("db_unavailable", "no database connection configured");
  return cs;
}

async function defaultConnect(connectionString: string): Promise<ClosableSql> {
  const { default: postgres } = await import("postgres");
  return postgres(connectionString, RUNTIME_CLIENT_OPTIONS) as unknown as ClosableSql;
}

/** A REQUEST-scoped Postgres handle. In a Cloudflare Worker, an I/O object (the postgres.js client)
 *  must NOT be retained across requests — so there is deliberately NO module/isolate-level client
 *  cache. One scope is created inside the request handler and passed through services/repositories,
 *  then closed in `finally`. Hyperdrive owns cross-request pooling. */
export interface RequestPgScope {
  /** Lazily obtain this request's PgExec; concurrent calls share ONE connection attempt. */
  getExec(): Promise<PgExec>;
  /** Wait for any in-flight connection, then close this request's client. Idempotent. */
  close(): Promise<void>;
}

export function createRequestPgScope(
  env: RuntimeEnv,
  connect: (connectionString: string) => Promise<ClosableSql> = defaultConnect,
): RequestPgScope {
  let sqlPromise: Promise<ClosableSql> | null = null;
  let exec: PgExec | null = null;
  let closed = false;

  const getExec = async (): Promise<PgExec> => {
    if (closed)
      throw new ContentError("db_unavailable", "request database scope is already closed");
    if (exec) return exec;
    const cs = connectionStringOf(env); // throws db_unavailable when no binding/URL is configured
    // Store the in-flight promise BEFORE awaiting so concurrent getExec() calls share one attempt; the
    // catch clears it on failure so a REJECTED connection is never cached (the next call retries).
    sqlPromise ??= connect(cs).catch((err) => {
      sqlPromise = null;
      throw err;
    });
    const sql = await sqlPromise;
    exec ??= postgresExec(sql);
    return exec;
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (!sqlPromise) return;
    try {
      const sql = await sqlPromise;
      await sql.end({ timeout: 5 });
    } catch {
      /* ignore teardown / never-connected errors */
    }
  };

  return { getExec, close };
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
