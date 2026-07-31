// BOUNDED, NON-PRODUCTION runtime smoke for the Postgres content path (§6 gate for the NEXT phase).
// It is a GATE, not part of the POC: it no-ops (exit 0) unless SMOKE_DATABASE_URL is set, so CI and
// the PGlite POC never touch a real cluster. When pointed at a *disposable Supabase preview branch*
// (never production — the guard below refuses obvious prod hosts), it exercises the real driver end
// to end: one real connection, one transaction, one prepared query, and connection-failure MAPPING.
//
// What this proves that PGlite cannot: the postgres.js driver + TLS + a real PG server + prepared
// statements + our error mapping over the wire. What it still does NOT prove until run with a real
// Hyperdrive binding in a deployed Worker: Hyperdrive pooling/session behavior. That last hop is a
// deploy-time smoke, called out in db/pg/README.md — this script is the local/CI-preview rung.
//
// Run:  SMOKE_DATABASE_URL="postgres://…preview…" bun scripts/pg-runtime-smoke.ts
import { createRuntimeExec, healthCheck } from "../src/features/content-pg/pg-adapter";
import { createPage, createBlock, upsertLocalization, createDraftRevision, approveRevision, publish } from "../src/features/content-pg/content.repo";
import { ContentError } from "../src/features/content-pg/content.errors";

const url = process.env.SMOKE_DATABASE_URL;
if (!url) {
  console.log("pg-runtime-smoke: SKIPPED (no SMOKE_DATABASE_URL). This gate runs only against a\n" +
    "disposable Supabase preview branch, never in the POC/CI default path.");
  process.exit(0);
}
// Refuse anything that looks like the production project — a disposable preview branch is required.
if (/prod|production/i.test(url)) {
  console.error("pg-runtime-smoke: REFUSED — host looks like production. Use a preview branch.");
  process.exit(2);
}

async function main(): Promise<void> {
  // Exercise the EXACT runtime factory (max:1, prepared, bounded timeouts). No string is ever logged.
  const exec = await createRuntimeExec({ DATABASE_URL: url! });
  let failed = 0;
  const ok = (cond: boolean, label: string) => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}`);
    if (!cond) failed += 1;
  };
  {
    ok((await healthCheck(exec)).ok, "real connection + health check (SELECT 1)");

    // One transaction + one prepared, parameterized query round-trip.
    const rows = await exec.tx(async (tx) => tx.query<{ two: number }>("SELECT $1::int + $1::int AS two", [1]));
    ok(rows[0]?.two === 2, "transaction + prepared parameterized query round-trip");

    // A disposable page/block/localization for the write-path checks (unique slug per run).
    const pageId = await createPage(exec, `smoke-${Date.now()}`);
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "k", position: 1, coreConfig: {} });
    const locId = await upsertLocalization(exec, blockId, "en");
    // Draft → approve → publish (the reviewed revision copies the exact draft).
    const draft = await createDraftRevision(exec, "capability", { localizationId: locId, title: "wip", description: "d" });
    const reviewed = await approveRevision(exec, draft, 1);

    // Publication APPROVAL through content.publish_revision (reviewed passes).
    await publish(exec, locId, reviewed);
    ok(true, "publication approval: reviewed revision published via content.publish_revision");

    // Publication REJECTION (draft) surfaces as a typed ContentError; no credential leaks in the message.
    try {
      await publish(exec, locId, draft);
      ok(false, "expected draft publish to be rejected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ok(e instanceof ContentError && e.code === "not_publishable", "publication rejection: draft rejected as typed ContentError");
      ok(!msg.includes("@") && !msg.includes(url!), "error message carries no credential/connection string");
    }

    // Error MAPPING: a duplicate-identity insert surfaces as a typed ContentError, not a raw throw.
    try {
      await createBlock(exec, { pageId, kind: "capability", blockKey: "k", position: 2, coreConfig: {} });
      ok(false, "expected duplicate-identity error on second insert");
    } catch (e) {
      ok(e instanceof ContentError, "duplicate insert maps to a typed ContentError");
    }
  }
  console.log(`\n${failed === 0 ? "smoke PASSED" : "smoke FAILED"} (${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("pg-runtime-smoke: unexpected error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
