#!/usr/bin/env bun
// PostgreSQL migration CLI for the content data plane.
//
// FAIL-CLOSED, non-production. Same posture as scripts/pg-runtime-smoke.ts: a connection is
// only opened against a host on an explicit preview allowlist, and neither the credential nor
// the full URL is ever printed.
//
// Commands
//   status     Read schema_migrations and report applied/pending. No writes beyond the
//              CREATE TABLE IF NOT EXISTS for the history table itself.
//   plan       Same comparison, no database connection at all — checksums the files on disk.
//   up         Apply pending migrations under the advisory lock.
//   bootstrap  Apply db/pg/bootstrap/*.sql. Separate on purpose: roles are cluster objects,
//              not schema history, and bootstrap is idempotent by design.
//
// Configuration
//   MIGRATE_DATABASE_URL    postgres://…  DIRECT connection as the MIGRATION OWNER.
//                           Never Hyperdrive: session multiplexing can move an advisory lock
//                           or a DDL statement to a different backend, defeating the lock.
//                           Never the runtime login, never `postgres`.
//   MIGRATE_PREVIEW_HOSTS   comma-separated exact hostnames authorized for migration.
//
// Behaviour
//   • `plan` needs no configuration and never connects.
//   • no MIGRATE_DATABASE_URL          → REFUSE (exit 2). Unlike the opt-in smoke, this is not
//                                        skippable: a migration command that silently does
//                                        nothing is worse than one that fails.
//   • MIGRATE_PREVIEW_HOSTS unset      → REFUSE (exit 2).
//   • host not on the allowlist        → REFUSE (exit 2), before any connection.
//
// Examples
//   bun run db:pg:plan
//   MIGRATE_DATABASE_URL="postgres://…" MIGRATE_PREVIEW_HOSTS="db.abc.supabase.co" bun run db:pg:status
//   MIGRATE_DATABASE_URL="postgres://…" MIGRATE_PREVIEW_HOSTS="db.abc.supabase.co" bun run db:pg:up

import { healthCheck } from "../src/features/content-pg/pg-adapter";
import { postgresMigrationExec } from "../src/features/content-pg/migrate/exec";
import { discoverBootstrap, discoverMigrations } from "../src/features/content-pg/migrate/discover";
import {
  buildPlan,
  migrationStatus,
  runMigrations,
  type Migration,
  type MigrationExec,
} from "../src/features/content-pg/migrate/runner";

/** A DIRECT postgres.js connection as the migration owner.
 *
 *  Deliberately NOT createRequestPgScope: that is the RUNTIME path, which prefers the
 *  Hyperdrive binding when one is present. A migration must never run over a pooler —
 *  session multiplexing can move the advisory lock or a DDL statement to a different backend.
 *  `max: 1` pins every statement of this run to one session, which is what makes the
 *  session-scoped advisory lock meaningful. */
async function connectDirect(connectionString: string) {
  const { default: postgres } = await import("postgres");
  return postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    // Never echo SQL or parameters — a migration session's logs must stay secret-free.
    onnotice: () => {},
  });
}

type Command = "status" | "plan" | "up" | "bootstrap";

const COMMANDS: readonly Command[] = ["status", "plan", "up", "bootstrap"];

function usage(): never {
  console.error(`Usage: bun scripts/pg-migrate.ts <${COMMANDS.join("|")}>`);
  process.exit(2);
}

const command = process.argv[2] as Command | undefined;
if (!command || !COMMANDS.includes(command)) usage();

/** Resolve an authorized preview connection, or refuse. Returns the URL and the hostname —
 *  the hostname is the ONLY part that is ever printed. */
function authorizedUrl(): { url: string; host: string } {
  const url = process.env.MIGRATE_DATABASE_URL;
  const allowlist = (process.env.MIGRATE_PREVIEW_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (!url) {
    console.error(
      "pg-migrate: REFUSED — MIGRATE_DATABASE_URL is not set.\n" +
        "This command does not skip when unconfigured: a migration step that silently\n" +
        "does nothing would report success without touching the database.",
    );
    process.exit(2);
  }
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    console.error("pg-migrate: REFUSED — MIGRATE_DATABASE_URL is not a valid URL.");
    process.exit(2);
  }
  if (allowlist.length === 0) {
    console.error(
      "pg-migrate: REFUSED — MIGRATE_PREVIEW_HOSTS is not configured. Fail-closed: an\n" +
        "explicit preview-host allowlist is required before any connection or DDL.",
    );
    process.exit(2);
  }
  if (!allowlist.includes(host)) {
    console.error(
      `pg-migrate: REFUSED — host "${host}" is not on the preview allowlist. Fail-closed.`,
    );
    process.exit(2);
  }
  return { url, host };
}

// ── Command implementations ─────────────────────────────────────────────────────────────────
// One responsibility each, so `main` stays a readable four-step orchestration: parse intent →
// validate configuration → execute → map an exit code. (The single `main` that did all of this
// inline measured Cognitive Complexity 16.)

/** Offline pre-flight: ordering, checksums and declared transaction mode, straight from disk.
 *  Never connects, so a reviewer can run it with no credentials at all. */
function runPlan(onDisk: readonly Migration[]): number {
  console.log(`Migration plan — ${onDisk.length} file(s) in db/pg/migrations
`);
  for (const m of onDisk) {
    const mode = m.transactional ? "transactional" : "NON-transactional";
    console.log(`  ${m.name}  ${m.checksum.slice(0, 12)}…  ${mode}`);
  }
  // Empty history: everything on disk is pending. This also exercises buildPlan offline.
  const { pending } = buildPlan(onDisk, []);
  console.log(`
Against an empty database: ${pending.length} would apply, in this order.`);
  return 0;
}

async function runStatus(exec: MigrationExec, onDisk: readonly Migration[]): Promise<number> {
  const { plan, applied } = await migrationStatus(exec, onDisk);
  for (const entry of plan.entries) {
    const at = applied.find((a) => a.name === entry.name)?.appliedAt;
    console.log(
      entry.state === "applied"
        ? `  ✓ ${entry.name}  applied ${at?.toISOString() ?? "?"}`
        : `  · ${entry.name}  PENDING`,
    );
  }
  console.log(`
${plan.pending.length} pending, ${applied.length} applied.`);
  return 0;
}

/** Not recorded in schema_migrations — see runner.ts. Applied after the migrations, by the
 *  same migration owner, so it owns the SECURITY DEFINER functions. */
async function runBootstrap(exec: MigrationExec): Promise<number> {
  for (const file of discoverBootstrap()) {
    console.log(`Applying bootstrap ${file.name}…`);
    await exec.script(file.sql);
    console.log(`  ✓ ${file.name}`);
  }
  return 0;
}

async function runUp(exec: MigrationExec, onDisk: readonly Migration[]): Promise<number> {
  const result = await runMigrations(exec, onDisk, { log: (m) => console.log(m) });
  console.log(
    `
${result.applied.length} applied this run, ${result.alreadyApplied.length} already present.`,
  );
  return 0;
}

/** Open an authorized preview connection, prove it is healthy, and run `body`. Owns the
 *  connection lifecycle so no command has to remember to close it. */
async function withAuthorizedConnection(
  body: (exec: MigrationExec) => Promise<number>,
): Promise<number> {
  const { url, host } = authorizedUrl();
  const sql = await connectDirect(url);
  try {
    const exec = postgresMigrationExec(sql as never);
    if (!(await healthCheck(exec)).ok) {
      console.error("pg-migrate: REFUSED — health check failed; aborting before any DDL.");
      return 2;
    }
    console.log(`pg-migrate: connected to preview host ${host}
`);
    return await body(exec);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<number> {
  const onDisk = discoverMigrations();

  if (command === "plan") return runPlan(onDisk);

  return withAuthorizedConnection(async (exec) => {
    if (command === "status") return runStatus(exec, onDisk);
    if (command === "bootstrap") return runBootstrap(exec);
    return runUp(exec, onDisk);
  });
}

try {
  process.exit(await main());
} catch (err) {
  // Print the message only. A driver error can carry the connection string in some fields, so
  // the full object is never dumped.
  console.error(`pg-migrate: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
