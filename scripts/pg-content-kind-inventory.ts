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

// ── Seed SQL parser (robust: handles quoted commas, '' escaped apostrophes, line/block comments,
//    multi-row VALUES, and any kind-column position; fails LOUDLY on an unsupported shape) ───────────

/** Split SQL into statements on `;` at string-depth 0, stripping `--` and block comments. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let inStr = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (inStr) {
      buf += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          buf += "'";
          i += 1;
        } // escaped '' stays inside the string
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") {
      inStr = true;
      buf += ch;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    if (ch === ";") {
      statements.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) statements.push(buf);
  return statements;
}

/** Parse the VALUES portion into tuples of field values (quotes stripped, '' unescaped). */
function parseValueTuples(valuesText: string): string[][] {
  const tuples: string[][] = [];
  let i = 0;
  while (i < valuesText.length) {
    while (i < valuesText.length && valuesText[i] !== "(") i += 1;
    if (i >= valuesText.length) break;
    i += 1; // past '('
    const fields: string[] = [];
    let buf = "";
    let inStr = false;
    let closed = false;
    while (i < valuesText.length && !closed) {
      const ch = valuesText[i];
      if (inStr) {
        if (ch === "'") {
          if (valuesText[i + 1] === "'") {
            buf += "'";
            i += 2;
            continue;
          }
          inStr = false;
          i += 1;
          continue;
        }
        buf += ch;
        i += 1;
        continue;
      }
      if (ch === "'") {
        inStr = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        fields.push(buf.trim());
        buf = "";
        i += 1;
        continue;
      }
      if (ch === ")") {
        fields.push(buf.trim());
        closed = true;
        i += 1;
        continue;
      }
      buf += ch;
      i += 1;
    }
    tuples.push(fields);
  }
  return tuples;
}

export interface KindExtraction {
  kinds: string[];
  errors: string[];
}

/** Extract every `kind` value inserted into `service_blocks` in one seed file. Returns discovered kinds
 *  and any hard errors (missing kind column, tuple/column arity mismatch) — never silently skips. */
export function extractKindsFromSeedSql(sql: string): KindExtraction {
  const kinds: string[] = [];
  const errors: string[] = [];
  for (const stmt of splitStatements(sql)) {
    if (!/insert\s+into\s+service_blocks/i.test(stmt)) continue;
    const colMatch = /service_blocks\s*\(([^)]*)\)\s*values/i.exec(stmt);
    if (!colMatch) {
      errors.push("service_blocks INSERT without a parsable column list");
      continue;
    }
    const cols = colMatch[1].split(",").map((c) => c.trim().toLowerCase());
    const kindIdx = cols.indexOf("kind");
    if (kindIdx === -1) {
      errors.push("service_blocks INSERT has no `kind` column");
      continue;
    }
    const valuesText = stmt.slice(colMatch.index + colMatch[0].length);
    for (const tuple of parseValueTuples(valuesText)) {
      if (tuple.length !== cols.length) {
        errors.push(`tuple arity ${tuple.length} != column count ${cols.length}`);
        continue;
      }
      kinds.push(tuple[kindIdx]);
    }
  }
  return { kinds, errors };
}

/** kind → the set of sources it was discovered in. Second return: hard parser errors. */
export function discoverKinds(seedDir?: string): {
  discovered: Map<string, Set<string>>;
  errors: string[];
} {
  const discovered = new Map<string, Set<string>>();
  const errors: string[] = [];
  const add = (kind: string, source: string): void => {
    const sources = discovered.get(kind) ?? new Set<string>();
    sources.add(source);
    discovered.set(kind, sources);
  };

  const dir = seedDir ?? fileURLToPath(new URL("../db/seeds/", import.meta.url));
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  } catch {
    errors.push(`seed directory not found or unreadable: ${dir}`);
  }
  for (const file of files) {
    const { kinds, errors: fileErrors } = extractKindsFromSeedSql(
      readFileSync(`${dir}/${file}`, "utf8"),
    );
    kinds.forEach((k) => add(k, `seed:${file}`));
    fileErrors.forEach((e) => errors.push(`${file}: ${e}`));
  }
  for (const b of FULFILL_CONTENT_MANIFEST.blocks) add(b.kind, "manifest:fulfill.content.ts");
  for (const kind of Object.keys(KIND_REGISTRY)) add(kind, "registry");
  return { discovered, errors };
}

function main(): void {
  const registered = new Set(Object.keys(KIND_REGISTRY));
  const { discovered, errors } = discoverKinds();
  const isSeededOrManifested = (sources: Set<string>): boolean =>
    [...sources].some((s) => s !== "registry");

  const kinds = [...discovered.keys()].sort(byName);
  console.log("KIND INVENTORY (production service-block kinds)\n");
  let unregistered = 0;
  for (const kind of kinds) {
    const status = registered.has(kind) ? "registered" : "UNREGISTERED";
    if (status === "UNREGISTERED") unregistered += 1;
    console.log(`  ${kind.padEnd(16)} ${status.padEnd(13)} ${sortedJoin(discovered.get(kind)!)}`);
  }

  const registryOnly = [...registered]
    .filter((k) => !isSeededOrManifested(discovered.get(k)!))
    .sort(byName);
  console.log(
    `\n  registry-only (accepted, not yet seeded): ${registryOnly.join(", ") || "(none)"}`,
  );

  console.log(
    [
      "\nLive-data query (run later against the current D1/PG store; NOT executed here):",
      "  -- D1:  SELECT DISTINCT kind FROM service_blocks ORDER BY kind;",
      "  -- PG:  SELECT DISTINCT kind FROM content.service_content_blocks ORDER BY kind;",
      "  Reconcile the result against KIND_REGISTRY; any new kind must be registered before it is served.",
    ].join("\n"),
  );

  if (errors.length > 0) {
    console.error(`\nPARSER ERRORS (unsupported seed shapes — fix the seed or the parser):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
  }
  console.log(
    `\n${kinds.length} kinds discovered, ${unregistered} unregistered, ${errors.length} parser error(s)`,
  );
  if (unregistered > 0 || errors.length > 0) process.exit(1);
}

if (import.meta.main) main();
