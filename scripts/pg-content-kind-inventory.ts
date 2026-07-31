// Deterministic inventory of every production service-block KIND, cross-checked against the code-owned
// registry. Sources scanned (files on this branch — no network, no live read):
//   • D1 seed SQL (db/seeds/*.sql) — thg-order kinds
//   • the Fulfill content manifest — thg-fulfill kinds
//   • the kind registry — the source of truth for what is accepted on write
// A discovered kind that is NOT in the registry fails the inventory. There is currently no
// legacy-adapter-only kind (every discovered kind is first-class in the registry), so no such state is
// modelled — a future legacy kind would surface as UNREGISTERED and fail, forcing an explicit decision.
// A documented live-data query is printed for later execution once credentials exist (NOT run here).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { KIND_REGISTRY } from "../src/features/content-pg/content.kinds";
import { FULFILL_CONTENT_MANIFEST } from "../src/features/content-pg/manifests/fulfill.content";

const byName = (a: string, b: string): number => a.localeCompare(b);
const sortedJoin = (values: Iterable<string>): string => [...values].sort(byName).join(", ");

/** kind → the set of sources it was discovered in. */
function discoverKinds(): Map<string, Set<string>> {
  const discovered = new Map<string, Set<string>>();
  const add = (kind: string, source: string): void => {
    const sources = discovered.get(kind) ?? new Set<string>();
    sources.add(source);
    discovered.set(kind, sources);
  };

  // D1 seed SQL — INSERT INTO service_blocks (page_slug, kind, …) VALUES ('slug', 'kind', …)
  const seedDir = fileURLToPath(new URL("../db/seeds/", import.meta.url));
  for (const file of readdirSync(seedDir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(new URL(`../db/seeds/${file}`, import.meta.url), "utf8");
    for (const m of sql.matchAll(/service_blocks[^)]*\)\s*VALUES\s*\('[^']+',\s*'([a-z_]+)'/g)) {
      add(m[1], `seed:${file}`);
    }
  }
  for (const b of FULFILL_CONTENT_MANIFEST.blocks) add(b.kind, "manifest:fulfill.content.ts");
  for (const kind of Object.keys(KIND_REGISTRY)) add(kind, "registry");
  return discovered;
}

function main(): void {
  const registered = new Set(Object.keys(KIND_REGISTRY));
  const discovered = discoverKinds();
  const isRegistered = (kind: string): boolean => registered.has(kind);
  const isSeededOrManifested = (sources: Set<string>): boolean =>
    [...sources].some((s) => s !== "registry");

  const kinds = [...discovered.keys()].sort(byName);
  console.log("KIND INVENTORY (production service-block kinds)\n");
  let unregistered = 0;
  for (const kind of kinds) {
    const status = isRegistered(kind) ? "registered" : "UNREGISTERED";
    if (status === "UNREGISTERED") unregistered += 1;
    console.log(`  ${kind.padEnd(16)} ${status.padEnd(13)} ${sortedJoin(discovered.get(kind)!)}`);
  }

  const registryOnly = [...registered].filter((k) => !isSeededOrManifested(discovered.get(k)!)).sort(byName);
  console.log(`\n  registry-only (accepted, not yet seeded): ${registryOnly.join(", ") || "(none)"}`);

  console.log(
    [
      "\nLive-data query (run later against the current D1/PG store; NOT executed here):",
      "  -- D1:  SELECT DISTINCT kind FROM service_blocks ORDER BY kind;",
      "  -- PG:  SELECT DISTINCT kind FROM content.service_content_blocks ORDER BY kind;",
      "  Reconcile the result against KIND_REGISTRY; any new kind must be registered before it is served.",
    ].join("\n"),
  );

  console.log(`\n${kinds.length} kinds discovered, ${unregistered} unregistered`);
  if (unregistered > 0) process.exit(1);
}

main();
