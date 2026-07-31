// BOUNDED, NON-PRODUCTION runtime smoke for the Postgres content path (Phase-2 gate precursor).
// FAIL-CLOSED: it runs the write path ONLY against a host on an explicit preview allowlist, and only
// after preflight passes. It never logs a credential or the full connection string (hostname only).
//
// Configuration (both required to run the write path):
//   SMOKE_DATABASE_URL   postgres://…  (a disposable Supabase PREVIEW branch — never production)
//   SMOKE_PREVIEW_HOSTS  comma-separated exact hostnames that are authorized preview databases
//
// Behaviour:
//   • no SMOKE_DATABASE_URL              → SKIP (exit 0): the gate is opt-in.
//   • URL set, SMOKE_PREVIEW_HOSTS unset → REFUSE (exit 2): preview authorization is required.
//   • host not on the allowlist          → REFUSE (exit 2): fail closed before any connection/write.
//   • authorized                         → preflight (health + prepared query + host verify) then run
//     the disposable write path inside ONE transaction that always rolls back (no fixture survives).
//
// Run:  SMOKE_DATABASE_URL="postgres://…preview…" SMOKE_PREVIEW_HOSTS="db.preview.example" bun scripts/pg-runtime-smoke.ts
import {
  createRuntimeExec,
  healthCheck,
  closeRuntimeClients,
} from "../src/features/content-pg/pg-adapter";
import { runDisposableWritePath } from "./pg-smoke-writepath";

const url = process.env.SMOKE_DATABASE_URL;
const allowlist = (process.env.SMOKE_PREVIEW_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

if (!url) {
  console.log(
    "pg-runtime-smoke: SKIPPED (no SMOKE_DATABASE_URL). This gate is opt-in and runs only\n" +
      "against a disposable Supabase preview branch.",
  );
  process.exit(0);
}

// Parse the URL and inspect the HOSTNAME ONLY — never log credentials or the full URL.
let host: string;
try {
  host = new URL(url).hostname.toLowerCase();
} catch {
  console.error("pg-runtime-smoke: REFUSED — SMOKE_DATABASE_URL is not a valid URL.");
  process.exit(2);
}
if (allowlist.length === 0) {
  console.error(
    "pg-runtime-smoke: REFUSED — SMOKE_PREVIEW_HOSTS is not configured. Fail-closed: an\n" +
      "explicit preview-host allowlist is required before any connection or write.",
  );
  process.exit(2);
}
if (!allowlist.includes(host)) {
  console.error(
    `pg-runtime-smoke: REFUSED — host "${host}" is not on the preview allowlist. Fail-closed.`,
  );
  process.exit(2);
}

async function main(): Promise<number> {
  let failed = 0;
  const ok = (cond: boolean, label: string) => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}`);
    if (!cond) failed += 1;
  };
  try {
    const exec = await createRuntimeExec({ DATABASE_URL: url! });

    // Preflight — any failure aborts BEFORE any content write.
    if (!(await healthCheck(exec)).ok) {
      console.error(
        "pg-runtime-smoke: REFUSED — preflight health check failed; aborting before writes.",
      );
      return 2;
    }
    ok(true, `preflight: health check passed (host ${host})`);
    const two = await exec.query<{ two: number }>("SELECT $1::int + $1::int AS two", [1]);
    ok(two[0]?.two === 2, "preflight: prepared parameterized query round-trip");

    // Disposable write path — one transaction, always rolled back (no fixture survives).
    const checks = await runDisposableWritePath(exec);
    for (const line of checks) {
      console.log(`  ${line}`);
      if (line.startsWith("✗")) failed += 1;
    }
    ok(true, "disposable write path rolled back — no fixture survives");
  } finally {
    await closeRuntimeClients();
  }
  console.log(`\n${failed === 0 ? "smoke PASSED" : "smoke FAILED"} (${failed} failed)`);
  return failed;
}

// Top-level await with an explicit error boundary. Any error text is scrubbed of the connection string
// before logging, so an unexpected DB/driver error can never leak a credential. Non-zero exit preserved.
try {
  const failed = await main();
  process.exit(failed > 0 ? 1 : 0);
} catch (e) {
  const raw = e instanceof Error ? e.message : String(e);
  const safe = url ? raw.split(url).join("[redacted]") : raw;
  console.error("pg-runtime-smoke: unexpected error:", safe);
  process.exit(1);
}
