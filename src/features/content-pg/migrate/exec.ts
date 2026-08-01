// MigrationExec adapters. Kept out of pg-adapter.ts on purpose: the runtime adapter must not
// grow a raw multi-statement executor (see the MigrationExec doc comment in ./runner).

import { pgliteExec, postgresExec } from "../pg-adapter";
import type { MigrationExec } from "./runner";

interface PgliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(
    fn: (tx: { query<R>(t: string, p?: unknown[]): Promise<{ rows: R[] }> }) => Promise<T>,
  ): Promise<T>;
  /** PGlite's simple-protocol entry point — accepts multiple statements. */
  exec(sql: string): Promise<unknown>;
}

/** PGlite (tests, local proof). `db.exec` is the simple query protocol. */
export function pgliteMigrationExec(db: PgliteLike): MigrationExec {
  return {
    ...pgliteExec(db),
    script: async (sql) => {
      await db.exec(sql);
    },
  };
}

interface SimpleQuery<T> extends Promise<T> {
  /** postgres.js opt-in to the simple protocol; required for multi-statement SQL. */
  simple(): Promise<T>;
}
interface MigrationSqlLike {
  unsafe<T>(text: string, params?: unknown[], options?: { prepare?: boolean }): SimpleQuery<T>;
  begin<T>(fn: (sql: MigrationSqlLike) => Promise<T>): Promise<T>;
  savepoint<T>(fn: (sql: MigrationSqlLike) => Promise<T>): Promise<T>;
}

/** postgres.js over a DIRECT connection (never Hyperdrive — see runner.ts).
 *  `.simple()` is what lets one call carry a whole migration file; without it postgres.js
 *  uses the extended protocol and a multi-statement file fails with a bare syntax error. */
export function postgresMigrationExec(sql: MigrationSqlLike): MigrationExec {
  return {
    ...postgresExec(sql as never),
    script: async (text) => {
      await sql.unsafe(text).simple();
    },
  };
}
