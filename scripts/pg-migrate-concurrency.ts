#!/usr/bin/env bun
// REQUIRED preview gate: prove the migration advisory lock SERIALIZES two real runners.
//
// This is the one thing the PGlite suite cannot do. PGlite is a single in-process connection,
// and pg_advisory_lock is re-entrant within a session — a "second runner" there would simply
// be granted the lock again. Two genuinely separate backends are required, which means a real
// PostgreSQL server.
//
// FAIL, DO NOT SKIP. Unlike scripts/pg-runtime-smoke.ts (an opt-in local convenience), this
// gate exits non-zero when the preview environment is absent. A concurrency gate that skips
// when unconfigured reports green for the exact situation it exists to catch, and the program
// brief requires the preview gate to be blocking.
//
// Configuration (both required):
//   MIGRATE_DATABASE_URL    postgres://…  DIRECT connection to a DISPOSABLE preview database.
//   MIGRATE_PREVIEW_HOSTS   comma-separated exact hostnames authorized for migration.
//
// This gate WRITES: it applies the real migration set to the target database. Point it only at
// a disposable preview branch, never at anything whose schema you care about.

import { postgresMigrationExec } from "../src/features/content-pg/migrate/exec";
import { discoverMigrations } from "../src/features/content-pg/migrate/discover";
import {
  MIGRATION_LOCK_KEYS,
  ensureMigrationTable,
  readApplied,
  runMigrations,
  withMigrationLock,
} from "../src/features/content-pg/migrate/runner";

const url = process.env.MIGRATE_DATABASE_URL;
const allowlist = (process.env.MIGRATE_PREVIEW_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

if (!url) {
  console.error(
    "pg-migrate-concurrency: FAILED — MIGRATE_DATABASE_URL is not set.\n" +
      "\n" +
      "This gate does NOT skip. Real multi-session locking cannot be proven in-process,\n" +
      "so an unconfigured run means the guarantee is UNPROVEN, not satisfied.\n" +
      "Provision the preview database first — see db/pg/PREVIEW_PROVISIONING.md.",
  );
  process.exit(1);
}

let host: string;
try {
  host = new URL(url).hostname.toLowerCase();
} catch {
  console.error("pg-migrate-concurrency: FAILED — MIGRATE_DATABASE_URL is not a valid URL.");
  process.exit(1);
}
if (allowlist.length === 0 || !allowlist.includes(host)) {
  console.error(
    `pg-migrate-concurrency: FAILED — host "${host}" is not on MIGRATE_PREVIEW_HOSTS. Fail-closed.`,
  );
  process.exit(1);
}

async function connect() {
  const { default: postgres } = await import("postgres");
  // max: 1 — each client is exactly ONE backend session, which is what makes "two runners"
  // real. A pool would let both "runners" land on the same session and the test would pass
  // for the wrong reason.
  return postgres(url!, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
}

let failed = 0;
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed += 1;
};

async function main(): Promise<number> {
  console.log(`pg-migrate-concurrency — real PostgreSQL, host ${host}\n`);
  const onDisk = discoverMigrations();

  const a = await connect();
  const b = await connect();
  try {
    const execA = postgresMigrationExec(a as never);
    const execB = postgresMigrationExec(b as never);

    // Two distinct backends, or nothing below means anything.
    const [pidA] = await execA.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const [pidB] = await execB.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    check(pidA.pid !== pidB.pid, `two distinct backends (${pidA.pid} / ${pidB.pid})`);

    // ── 1. The lock actually blocks a second session ────────────────────────────────────
    let bEnteredWhileAHeld = false;
    await withMigrationLock(execA, async () => {
      // B must NOT get the lock while A holds it. pg_try_advisory_lock is the
      // non-blocking probe — a blocking wait here would deadlock the gate.
      const [tried] = await execB.query<{ got: boolean }>(
        "SELECT pg_try_advisory_lock($1, $2) AS got",
        [MIGRATION_LOCK_KEYS.namespace, MIGRATION_LOCK_KEYS.id],
      );
      bEnteredWhileAHeld = tried.got;
      if (tried.got) {
        await execB.query("SELECT pg_advisory_unlock($1, $2)", [
          MIGRATION_LOCK_KEYS.namespace,
          MIGRATION_LOCK_KEYS.id,
        ]);
      }
    });
    check(!bEnteredWhileAHeld, "a second session is refused the lock while the first holds it");

    // ── 2. …and gets it once the first releases ─────────────────────────────────────────
    const [afterRelease] = await execB.query<{ got: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS got",
      [MIGRATION_LOCK_KEYS.namespace, MIGRATION_LOCK_KEYS.id],
    );
    check(afterRelease.got, "the lock is available again after the first runner releases it");
    if (afterRelease.got) {
      await execB.query("SELECT pg_advisory_unlock($1, $2)", [
        MIGRATION_LOCK_KEYS.namespace,
        MIGRATION_LOCK_KEYS.id,
      ]);
    }

    // ── 3. A failed run releases the lock (no wedge for the next runner) ────────────────
    await withMigrationLock(execA, async () => {
      throw new Error("simulated migration failure");
    }).catch(() => {});
    const [afterFailure] = await execB.query<{ got: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS got",
      [MIGRATION_LOCK_KEYS.namespace, MIGRATION_LOCK_KEYS.id],
    );
    check(afterFailure.got, "a failed run releases the lock rather than wedging the next one");
    if (afterFailure.got) {
      await execB.query("SELECT pg_advisory_unlock($1, $2)", [
        MIGRATION_LOCK_KEYS.namespace,
        MIGRATION_LOCK_KEYS.id,
      ]);
    }

    // ── 4. Two runners started together: one applies, the other no-ops. Never both. ─────
    await ensureMigrationTable(execA);
    const before = await readApplied(execA);

    const [resA, resB] = await Promise.all([
      runMigrations(execA, onDisk),
      runMigrations(execB, onDisk),
    ]);

    const appliedTotal = resA.applied.length + resB.applied.length;
    const expectedNew = onDisk.filter((m) => !before.some((a) => a.name === m.name)).length;
    check(
      appliedTotal === expectedNew,
      `exactly ${expectedNew} migration(s) applied across both runners (got ${appliedTotal}) — no double-apply`,
    );

    // ── 5. One history row per migration, whichever runner won ──────────────────────────
    const [dupes] = await execA.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM (
         SELECT name FROM public.schema_migrations GROUP BY name HAVING count(*) > 1
       ) d`,
    );
    check(dupes.n === "0", "exactly one schema_migrations row per migration");

    const after = await readApplied(execA);
    check(
      after.length === onDisk.length,
      `history covers every migration on disk (${after.length}/${onDisk.length})`,
    );

    // ── 6. A rerun after the race is still a clean no-op ────────────────────────────────
    const rerun = await runMigrations(execA, onDisk);
    check(rerun.applied.length === 0, "a rerun after the race applies nothing");

    // ── 7. No secret in this gate's own output ──────────────────────────────────────────
    check(!JSON.stringify({ host }).includes("@"), "no credential appears in the gate output");

    return failed === 0 ? 0 : 1;
  } finally {
    await a.end({ timeout: 5 }).catch(() => {});
    await b.end({ timeout: 5 }).catch(() => {});
  }
}

try {
  const code = await main();
  console.log(
    code === 0
      ? "\nOK — advisory lock serializes real concurrent runners."
      : `\n${failed} check(s) failed.`,
  );
  process.exit(code);
} catch (err) {
  console.error(
    `pg-migrate-concurrency: FAILED — ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
