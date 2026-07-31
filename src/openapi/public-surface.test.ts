// THE contract-freeze gate.
//
// scripts/check-openapi-drift.ts proves that a DECLARED endpoint's schema is
// the canonical one. It cannot prove that an endpoint was declared at all —
// and that is exactly how /api/v1/service-blocks and POST /api/v1/leads, both
// live landing dependencies, shipped for months with no contract.
//
// This file closes that hole: it walks the real route tree on disk, derives
// the public URL and HTTP methods each file actually serves, and fails if the
// generated OpenAPI document does not cover them. Adding a public endpoint
// without declaring it now breaks `bun test`.
//
// It also enforces the contract-ownership rules that are otherwise only prose:
// consistent locale parameters, and no internal/database field ever reaching
// a public wire shape.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { expect, test } from "bun:test";

import { generateOpenApiDocument } from "./generate";

const PUBLIC_ROUTES_DIR = join(import.meta.dir, "..", "routes", "api", "v1", "(public)");

// Routes that are intentionally NOT in the OpenAPI document, each with the
// reason. Anything else missing is a failure, not an omission. Keep this list
// SHORT — it is the escape hatch, and every entry is a contract the landing
// cannot type against.
const UNDECLARED_BY_DESIGN: Record<string, string> = {
  "/api/v1/media/{splat}":
    "Binary R2 read proxy — responds with image/document bytes, not JSON, and " +
    "takes an unbounded splat key. Nothing to type; consumers use it as a URL.",
  "/api/v1/openapi": "Serves this document itself; declaring it is circular.",
};

/** Every .ts file under the (public) route tree, repo-relative. */
function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkRouteFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Derive the public URL a route file serves, using TanStack's file-route
 * conventions as they are actually used in this tree:
 *   index.ts               → the directory itself
 *   $slug.ts               → /{slug}
 *   $slug.same-issue.ts    → /{slug}/same-issue   (dot = path separator)
 *   $.ts                   → /{splat}
 */
function routeFileToPath(absFile: string): string {
  const rel = relative(PUBLIC_ROUTES_DIR, absFile).split(sep).join("/");
  const withoutExt = rel.replace(/\.ts$/, "");
  const segments = withoutExt.split("/");
  const last = segments.pop() as string;

  const tail =
    last === "index"
      ? []
      : last.split(".").map((part) => {
          if (part === "$") return "{splat}";
          return part.startsWith("$") ? `{${part.slice(1)}}` : part;
        });

  return ["/api/v1", ...segments, ...tail].join("/");
}

/**
 * The HTTP methods a route file serves, read from its `handlers` object.
 * OPTIONS is excluded everywhere: it is CORS preflight plumbing, identical on
 * every route, and not part of the content contract.
 */
function handlerMethods(absFile: string): string[] {
  const source = readFileSync(absFile, "utf8");
  const methods = new Set<string>();
  for (const m of source.matchAll(/^\s{6}(GET|POST|PUT|PATCH|DELETE):/gm)) {
    methods.add(m[1].toLowerCase());
  }
  return [...methods].sort();
}

const document = generateOpenApiDocument();
const declared = document.paths ?? {};
const routeFiles = walkRouteFiles(PUBLIC_ROUTES_DIR);

test("the public route tree is non-empty (guards against a broken walker)", () => {
  // Without this, a wrong PUBLIC_ROUTES_DIR would make every coverage test
  // below pass vacuously.
  expect(routeFiles.length).toBeGreaterThan(30);
});

test("every public route file is declared in the OpenAPI document", () => {
  const undeclared: string[] = [];
  for (const file of routeFiles) {
    const path = routeFileToPath(file);
    if (path in UNDECLARED_BY_DESIGN) continue;
    if (!(path in declared)) undeclared.push(`${path}  (${relative(PUBLIC_ROUTES_DIR, file)})`);
  }
  expect(
    undeclared,
    "Public endpoints with no OpenAPI declaration. Add a route config to " +
      "src/openapi/paths.ts (and a drift check), or — only if it genuinely " +
      "serves no typed JSON — add it to UNDECLARED_BY_DESIGN with a reason.",
  ).toEqual([]);
});

test("every declared method matches a handler the route file actually exports", () => {
  const mismatches: string[] = [];
  for (const file of routeFiles) {
    const path = routeFileToPath(file);
    if (path in UNDECLARED_BY_DESIGN) continue;
    const entry = declared[path];
    if (!entry) continue; // reported by the previous test

    const actual = handlerMethods(file);
    const documented = Object.keys(entry).sort();
    if (actual.join(",") !== documented.join(",")) {
      mismatches.push(`${path}: handlers=[${actual}] but OpenAPI declares [${documented}]`);
    }
  }
  expect(mismatches, "OpenAPI method set drifted from the route handlers.").toEqual([]);
});

test("the document declares nothing that no route file serves", () => {
  const servedPaths = new Set(routeFiles.map(routeFileToPath));
  const phantom = Object.keys(declared).filter((p) => !servedPaths.has(p));
  expect(
    phantom,
    "OpenAPI declares an endpoint with no handler — consumers would code " + "against a 404.",
  ).toEqual([]);
});

test("every locale parameter uses the same en|vi|zh contract", () => {
  // Locale is a platform-wide contract, not a per-endpoint choice. A route
  // that quietly accepts a different set (or types it as a bare string) is how
  // a future locale rollout turns into a public DTO redesign.
  const offenders: string[] = [];
  for (const [path, ops] of Object.entries(declared)) {
    for (const [method, op] of Object.entries(ops as Record<string, unknown>)) {
      const params = (op as { parameters?: Array<Record<string, unknown>> }).parameters ?? [];
      for (const param of params) {
        if (param.name !== "lang") continue;
        const schema = param.schema as { enum?: string[] } | undefined;
        const values = [...(schema?.enum ?? [])].sort().join("|");
        if (values !== "en|vi|zh") {
          offenders.push(`${method.toUpperCase()} ${path}: lang enum = [${values}]`);
        }
      }
    }
  }
  expect(offenders).toEqual([]);
});

test("no public response shape exposes an internal or raw-database field", () => {
  // The public API owns DTOs; the landing owns view models. Neither may depend
  // on a column name, a moderation-workflow field, or an unparsed JSON blob.
  // Editorial `status` is included: publication gating is applied server-side,
  // so a public consumer must never see or branch on it.
  const FORBIDDEN = [
    "payload_json",
    "notes_json",
    "columns_json",
    "rows_json",
    "utm_json",
    "owner_token_hash",
    "reviewer_email",
    "author_email",
    "ip",
    "user_agent",
    "private_evidence_note",
    "private_order_reference",
    "review_status",
    "moderation_status",
  ];

  const leaks: string[] = [];
  const seen = new WeakSet<object>();

  function scan(node: unknown, where: string): void {
    if (!node || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    const props = (node as { properties?: Record<string, unknown> }).properties;
    if (props) {
      for (const key of Object.keys(props)) {
        if (FORBIDDEN.includes(key)) leaks.push(`${where} → ${key}`);
      }
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      scan(value, where);
    }
  }

  for (const [path, ops] of Object.entries(declared)) {
    for (const [method, op] of Object.entries(ops as Record<string, unknown>)) {
      const responses = (op as { responses?: Record<string, unknown> }).responses ?? {};
      for (const [status, body] of Object.entries(responses)) {
        scan(body, `${method.toUpperCase()} ${path} → ${status}`);
      }
    }
  }

  expect(leaks, "Internal field reached a public response schema.").toEqual([]);
});

test("every error response uses the bounded { error } envelope", () => {
  // A raw provider or database message must never reach a public consumer.
  // Every non-2xx JSON body in the document is `{ error: string }`.
  const offenders: string[] = [];
  for (const [path, ops] of Object.entries(declared)) {
    for (const [method, op] of Object.entries(ops as Record<string, unknown>)) {
      const responses = (op as { responses?: Record<string, unknown> }).responses ?? {};
      for (const [status, body] of Object.entries(responses)) {
        if (Number(status) < 400) continue;
        const schema = (
          body as {
            content?: {
              "application/json"?: { schema?: { properties?: Record<string, unknown> } };
            };
          }
        ).content?.["application/json"]?.schema;
        const keys = Object.keys(schema?.properties ?? {});
        if (keys.length !== 1 || keys[0] !== "error") {
          offenders.push(`${method.toUpperCase()} ${path} → ${status}: [${keys}]`);
        }
      }
    }
  }
  expect(offenders).toEqual([]);
});
