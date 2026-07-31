// PostgreSQL schema-migration runner for the content data plane.
//
// db/pg/README said the full runner was YAGNI "until CI needs it". A preview environment plus
// an importer is exactly that point: applying a .sql file by hand stops being a contract the
// moment two people, or two CI jobs, can do it at once.
//
// Scope is deliberately narrow. This runs ORDERED schema migrations over ONE direct
// PostgreSQL connection. It is NOT a general framework:
//
//   - It never runs over Hyperdrive. Session multiplexing can silently move an advisory
//     lock or a DDL statement to a different backend, which is precisely the failure this
//     lock exists to prevent. Enforcing that is the caller's job (see cli.ts) because this
//     module takes an already-open exec port.
//   - It never runs bootstrap/. Roles are cluster objects, not per-database schema history,
//     and bootstrap/0001 is idempotent by design — recording it in schema_migrations would
//     claim a checksum over something meant to be re-run. discoverMigrations() reads
//     migrations/ only, and applyBootstrap() is a separate, unrecorded call.
//
// Concurrency model: a session-level advisory lock taken BEFORE schema_migrations is read.
// Reading first and locking second is the classic race — two runners both observe "0005 is
// pending" and both try to apply it. The lock is released in a finally, and PostgreSQL drops
// it automatically if the session dies, so a crashed runner cannot wedge the next one.

import { createHash } from "node:crypto";

import type { PgExec } from "../pg-adapter";

/**
 * Migration-only connection port.
 *
 * A migration file contains MANY statements. `PgExec.query` speaks the extended query
 * protocol (parse/bind/execute), which accepts exactly one statement — sending 0001 through
 * it fails with a bare syntax error. Multi-statement DDL needs the SIMPLE protocol, so this
 * port adds `script`.
 *
 * It is deliberately NOT added to `PgExec`: the runtime adapter must never grow a
 * raw multi-statement executor, because at runtime every string reaching the database should
 * be a parameterized single statement. Migration SQL is trusted, reviewed, on-disk content;
 * request data is not.
 *
 * Transaction control is explicit (`BEGIN`/`COMMIT`/`ROLLBACK`) rather than `PgExec.tx`,
 * because the runner must be able to decide, per migration, NOT to open a transaction at all.
 */
export interface MigrationExec extends PgExec {
  /** Execute one or more statements over the simple query protocol. Migration SQL only. */
  script(sql: string): Promise<void>;
}

/** Application-specific advisory lock key. Arbitrary but FIXED — changing it would let an old
 *  and a new runner hold "different" locks and run concurrently, which is the whole failure
 *  mode. Namespaced by a second key so it cannot collide with another advisory lock in the
 *  same database. */
export const MIGRATION_LOCK_KEYS = { namespace: 0x54_48_47_00, id: 0x6d_69_67_72 } as const;

export interface Migration {
  /** Filename, e.g. "0003_approve_revision.sql". The recorded identity. */
  name: string;
  sql: string;
  /** SHA-256 of the file contents. */
  checksum: string;
  /** False when the file declares `-- migrate:no-transaction` (see parseTransactionMode). */
  transactional: boolean;
}

export interface AppliedMigration {
  name: string;
  checksum: string;
  appliedAt: Date;
}

export type MigrationPlanEntry =
  | { name: string; state: "applied"; checksum: string }
  | { name: string; state: "pending"; checksum: string; transactional: boolean };

export interface MigrationPlan {
  entries: MigrationPlanEntry[];
  pending: Migration[];
}

/** A historical migration whose file no longer hashes to what was recorded. */
export class MigrationChecksumError extends Error {
  constructor(
    readonly migration: string,
    readonly recorded: string,
    readonly actual: string,
  ) {
    super(
      `Migration "${migration}" has changed since it was applied ` +
        `(recorded ${recorded.slice(0, 12)}…, file ${actual.slice(0, 12)}…). ` +
        `Applied migrations are immutable — add a NEW migration instead of editing this one.`,
    );
    this.name = "MigrationChecksumError";
  }
}

/** A migration recorded in the database that no longer exists on disk. */
export class MissingMigrationError extends Error {
  constructor(readonly migration: string) {
    super(
      `Migration "${migration}" is recorded as applied but is not present in db/pg/migrations. ` +
        `Deleting an applied migration makes the history unverifiable — restore the file.`,
    );
    this.name = "MissingMigrationError";
  }
}

export class MigrationFailedError extends Error {
  constructor(
    readonly migration: string,
    readonly cause: unknown,
  ) {
    super(
      `Migration "${migration}" failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "MigrationFailedError";
  }
}

export function checksumOf(sql: string): string {
  // Normalize line endings so a Windows checkout and a Linux CI runner agree. Without this,
  // every migration would appear "changed" on the first cross-platform run. splitLines is the
  // same normalization the directive parser uses, so the two can never disagree.
  return createHash("sha256").update(splitLines(sql).join("\n"), "utf8").digest("hex");
}

/** A migration file declaring an unknown or contradictory `-- migrate:` directive. */
export class InvalidMigrationDirectiveError extends Error {
  constructor(
    readonly migration: string,
    reason: string,
  ) {
    super(
      `Migration "${migration}" has an invalid directive: ${reason}. ` +
        `The only supported directive is \`-- migrate:no-transaction\`, at most once, in the ` +
        `leading comment block.`,
    );
    this.name = "InvalidMigrationDirectiveError";
  }
}

/** Split on either line ending so a CRLF checkout parses directives identically to a LF one. */
function splitLines(sql: string): string[] {
  return sql.replaceAll("\r\n", "\n").split("\n");
}

/** The one supported directive. Deliberately a single marker, not a DSL. */
const NO_TRANSACTION_DIRECTIVE = "no-transaction";
const DIRECTIVE_PATTERN = /^--\s*migrate:\s*(\S*)\s*$/;

/**
 * Read the transaction mode a migration declares.
 *
 * Default is TRANSACTIONAL. PostgreSQL's DDL is transactional, so the runner's explicit
 * BEGIN/COMMIT is right for every migration this repository has — but the assumption is not
 * universal: CREATE INDEX CONCURRENTLY, ALTER TYPE … ADD VALUE (pre-12) and CREATE DATABASE
 * are all refused inside a transaction block. Declaring the directive omits that wrapper.
 *
 * ponytail: the directive omits the runner's OWN transaction, not PostgreSQL's implicit one.
 * A multi-statement simple-protocol send is still executed as a single implicit transaction
 * (verified against real PostgreSQL via PGlite), so a migration that must genuinely escape a
 * transaction block has to contain exactly ONE statement. Splitting a file into statements
 * would need a SQL parser — a migration DSL this runner deliberately does not have. Keep such
 * a migration to one statement per file; add per-statement execution only if that stops being
 * enough.
 *
 * This replaces an earlier `NON_TRANSACTIONAL: string[] = []` allowlist. That list was
 * permanently empty, which made the non-transactional branch provably unreachable — the mode
 * has to come from the migration itself, not from a hardcoded set in the runner that nobody
 * would remember to update.
 *
 * The directive is part of the file, so `checksumOf` already covers it: flipping a migration's
 * mode after it has been applied changes its checksum and is rejected like any other edit.
 *
 * Scanning stops at the first line that is neither blank nor a comment, so a `-- migrate:` in a
 * SQL string literal or a trailing comment cannot be mistaken for a directive.
 */
export function parseTransactionMode(name: string, sql: string): boolean {
  let transactional = true;
  let seen = false;

  for (const raw of splitLines(sql)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (!line.startsWith("--")) break; // end of the leading comment block

    const match = DIRECTIVE_PATTERN.exec(line);
    if (!match) continue; // an ordinary comment

    if (seen) throw new InvalidMigrationDirectiveError(name, "more than one directive");
    if (match[1] !== NO_TRANSACTION_DIRECTIVE) {
      // An unrecognized directive is a typo of a safety-critical instruction — refuse rather
      // than silently defaulting to transactional and running it the wrong way.
      throw new InvalidMigrationDirectiveError(
        name,
        `unknown directive "${match[1] || "(empty)"}"`,
      );
    }
    seen = true;
    transactional = false;
  }

  return transactional;
}

/** Deterministic filename ordering for migrations and bootstrap scripts alike.
 *
 *  An explicit comparator, and an explicit locale: `localeCompare` with no locale argument uses
 *  the host's default collation, which could order two migrations differently on a developer's
 *  machine and in CI. Migration filenames are zero-padded ASCII (`0001_…`), so pinning "en-US"
 *  makes the order both stable and the numeric order. */
export function byMigrationFilename(a: string, b: string): number {
  return a.localeCompare(b, "en-US");
}

/** Order .sql files by filename. */
export function orderMigrationFiles(names: readonly string[]): string[] {
  return names.filter((n) => n.endsWith(".sql")).sort(byMigrationFilename);
}

export function toMigration(name: string, sql: string): Migration {
  return {
    name,
    sql,
    checksum: checksumOf(sql),
    transactional: parseTransactionMode(name, sql),
  };
}

/** Create the history table. Idempotent, and safe to call before the lock is held — it is
 *  `IF NOT EXISTS` DDL with no data dependency. */
export async function ensureMigrationTable(exec: MigrationExec): Promise<void> {
  await exec.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name        text        PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function readApplied(exec: MigrationExec): Promise<AppliedMigration[]> {
  const rows = await exec.query<{ name: string; checksum: string; applied_at: Date | string }>(
    `SELECT name, checksum, applied_at FROM public.schema_migrations ORDER BY name`,
  );
  return rows.map((r) => ({
    name: r.name,
    checksum: r.checksum,
    appliedAt: r.applied_at instanceof Date ? r.applied_at : new Date(r.applied_at),
  }));
}

/**
 * Compare disk against history. Throws on any inconsistency BEFORE anything is applied, so a
 * tampered history never gets a partial run on top of it.
 */
export function buildPlan(
  onDisk: readonly Migration[],
  applied: readonly AppliedMigration[],
): MigrationPlan {
  const byName = new Map(onDisk.map((m) => [m.name, m]));
  const appliedByName = new Map(applied.map((a) => [a.name, a]));

  for (const record of applied) {
    const file = byName.get(record.name);
    if (!file) throw new MissingMigrationError(record.name);
    if (file.checksum !== record.checksum) {
      throw new MigrationChecksumError(record.name, record.checksum, file.checksum);
    }
  }

  const entries: MigrationPlanEntry[] = onDisk.map((m) =>
    appliedByName.has(m.name)
      ? { name: m.name, state: "applied", checksum: m.checksum }
      : { name: m.name, state: "pending", checksum: m.checksum, transactional: m.transactional },
  );

  return { entries, pending: onDisk.filter((m) => !appliedByName.has(m.name)) };
}

export interface RunOptions {
  /** Statement timeout applied to the migration session, in ms. */
  statementTimeoutMs?: number;
  /** Lock acquisition timeout, in ms. A second runner waits this long, then fails. */
  lockTimeoutMs?: number;
  log?: (message: string) => void;
}

const DEFAULT_STATEMENT_TIMEOUT_MS = 120_000;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

/** Take the session advisory lock, run `body`, release in a finally.
 *
 *  Session-scoped (`pg_advisory_lock`) rather than transaction-scoped, because the lock must
 *  span ALL pending migrations — including non-transactional ones, which by definition are not
 *  inside a transaction to scope a lock to. */
export async function withMigrationLock<T>(
  exec: MigrationExec,
  body: () => Promise<T>,
  opts: RunOptions = {},
): Promise<T> {
  const lockTimeout = opts.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  // lock_timeout bounds the wait so a second runner fails fast and loudly instead of hanging
  // a CI job until the job timeout kills it with no diagnosis.
  await exec.query(`SET lock_timeout = ${Number(lockTimeout)}`);
  await exec.query(`SELECT pg_advisory_lock($1, $2)`, [
    MIGRATION_LOCK_KEYS.namespace,
    MIGRATION_LOCK_KEYS.id,
  ]);
  try {
    return await body();
  } finally {
    // Released even when a migration threw — the next runner must not inherit a wedged lock.
    // The session dying also releases it, so this is belt-and-braces, not the only path.
    await exec
      .query(`SELECT pg_advisory_unlock($1, $2)`, [
        MIGRATION_LOCK_KEYS.namespace,
        MIGRATION_LOCK_KEYS.id,
      ])
      .catch(() => {
        // A failed unlock on an already-broken connection must not mask the original error.
      });
  }
}

async function applyOne(exec: MigrationExec, migration: Migration): Promise<void> {
  const record = () =>
    exec.query(`INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)`, [
      migration.name,
      migration.checksum,
    ]);

  if (!migration.transactional) {
    // No explicit BEGIN/COMMIT. The history row is written after the script succeeds, so a
    // crash between the two leaves the migration applied but unrecorded — which is why a
    // migration that declares `-- migrate:no-transaction` must be written to be idempotent.
    await exec.script(migration.sql);
    await record();
    return;
  }

  // The DDL and its history row commit together: a failure leaves NO row, so a rerun retries
  // the whole migration rather than skipping a half-applied one. BEGIN/COMMIT are issued
  // directly instead of via PgExec.tx so the non-transactional branch above can exist at all.
  await exec.script("BEGIN");
  try {
    await exec.script(migration.sql);
    await record();
    await exec.script("COMMIT");
  } catch (err) {
    // ROLLBACK failing (a dead connection) must not replace the real error.
    await exec.script("ROLLBACK").catch(() => {});
    throw err;
  }
}

export interface RunResult {
  applied: string[];
  /** Every migration already recorded before this run. */
  alreadyApplied: string[];
}

/**
 * Apply all pending migrations under the advisory lock. Idempotent: a second run with nothing
 * pending performs no writes and reports an empty `applied`.
 *
 * The lock is taken BEFORE `readApplied` so two concurrent runners cannot both read the same
 * pending set.
 */
export async function runMigrations(
  exec: MigrationExec,
  onDisk: readonly Migration[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const log = opts.log ?? (() => {});
  await exec.query(
    `SET statement_timeout = ${Number(opts.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS)}`,
  );
  await ensureMigrationTable(exec);

  return withMigrationLock(
    exec,
    async () => {
      const applied = await readApplied(exec);
      const plan = buildPlan(onDisk, applied);

      if (plan.pending.length === 0) {
        log("No pending migrations.");
        return { applied: [], alreadyApplied: applied.map((a) => a.name) };
      }

      const done: string[] = [];
      for (const migration of plan.pending) {
        log(`Applying ${migration.name}${migration.transactional ? "" : " (non-transactional)"}…`);
        try {
          await applyOne(exec, migration);
        } catch (err) {
          // Fail on the FIRST failure — continuing would apply a later migration on top of a
          // schema the failed one was supposed to produce. The already-applied ones stay
          // recorded, so the rerun resumes exactly here.
          throw new MigrationFailedError(migration.name, err);
        }
        done.push(migration.name);
        log(`  ✓ ${migration.name}`);
      }
      return { applied: done, alreadyApplied: applied.map((a) => a.name) };
    },
    opts,
  );
}

/** Status without applying anything. Throws the same consistency errors as a real run, so
 *  `status` is a genuine pre-flight and not a softer view of the world. */
export async function migrationStatus(
  exec: MigrationExec,
  onDisk: readonly Migration[],
): Promise<{ plan: MigrationPlan; applied: AppliedMigration[] }> {
  await ensureMigrationTable(exec);
  const applied = await readApplied(exec);
  return { plan: buildPlan(onDisk, applied), applied };
}
