// Deterministic inventory of every production service-block KIND, cross-checked against the code-owned
// registry. Sources scanned (files on this branch — no network, no live read):
//   • D1 seed SQL (db/seeds/*.sql) — thg-order kinds
//   • the Fulfill content manifest — thg-fulfill kinds
//   • the kind registry — the source of truth for what is accepted on write
// Any discovered kind not in the registry (or only supported by a temporary legacy adapter) fails.
// A documented live-data query is printed for later execution once credentials exist (NOT run here).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { KIND_REGISTRY } from "../src/features/content-pg/content.kinds";
import { FULFILL_CONTENT_MANIFEST } from "../src/features/content-pg/manifests/fulfill.content";

/** Kinds accepted on write today. Extend here only with a registry entry (or a marked legacy adapter). */
const LEGACY_ADAPTER_ONLY: ReadonlySet<string> = new Set(); // none: every production kind is first-class

function fromSeeds(): Map<string, string[]> {
  const dir = fileURLToPath(new URL("../db/seeds/", import.meta.url));
  const out = new Map<string, string[]>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(new URL(`../db/seeds/${file}`, import.meta.url), "utf8");
    // INSERT INTO service_blocks (page_slug, kind, …) VALUES ('slug', 'kind', …)
    for (const m of sql.matchAll(/service_blocks[^)]*\)\s*VALUES\s*\('[^']+',\s*'([a-z_]+)'/g)) {
      const list = out.get(m[1]) ?? [];
      if (!list.includes(file)) list.push(file);
      out.set(m[1], list);
    }
  }
  return out;
}

function main(): void {
  const registered = new Set(Object.keys(KIND_REGISTRY));
  const discovered = new Map<string, Set<string>>();
  const add = (kind: string, src: string) => {
    const s = discovered.get(kind) ?? new Set<string>();
    s.add(src);
    discovered.set(kind, s);
  };

  for (const [kind, files] of fromSeeds()) files.forEach((f) => add(kind, `seed:${f}`));
  for (const b of FULFILL_CONTENT_MANIFEST.blocks) add(b.kind, "manifest:fulfill.content.ts");
  for (const k of registered) add(k, "registry");

  const rows = [...discovered.keys()].sort();
  console.log("KIND INVENTORY (production service-block kinds)\n");
  let unregistered = 0;
  for (const kind of rows) {
    const srcs = [...discovered.get(kind)!].sort().join(", ");
    const status = registered.has(kind) ? "registered" : LEGACY_ADAPTER_ONLY.has(kind) ? "legacy-adapter" : "UNREGISTERED";
    if (status === "UNREGISTERED") unregistered += 1;
    console.log(`  ${kind.padEnd(16)} ${status.padEnd(15)} ${srcs}`);
  }

  const usedInData = rows.filter((k) => [...discovered.get(k)!].some((s) => s !== "registry"));
  const registryOnly = [...registered].filter((k) => !usedInData.includes(k)).sort();
  console.log(`\n  registry-only (accepted, not yet seeded): ${registryOnly.join(", ") || "(none)"}`);

  console.log(
    [
      "\nLive-data query (run later against the current D1/PG store; NOT executed here):",
      "  -- D1:  SELECT DISTINCT kind FROM service_blocks ORDER BY kind;",
      "  -- PG:  SELECT DISTINCT kind FROM content.service_content_blocks ORDER BY kind;",
      "  Reconcile the result against KIND_REGISTRY; any new kind must be registered before it is served.",
    ].join("\n"),
  );

  console.log(`\n${rows.length} kinds discovered, ${unregistered} unregistered`);
  if (unregistered > 0) process.exit(1);
}

main();
