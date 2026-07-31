// THE contract-freeze gate.
//
// scripts/check-openapi-drift.ts proves that a DECLARED endpoint's schema is the canonical one.
// It cannot prove that an endpoint was declared at all — and that is exactly how
// /api/v1/service-blocks and POST /api/v1/leads, both live landing dependencies, shipped for
// months with no contract.
//
// This file closes that hole. It walks the real route tree on disk and checks it against
// ./route-classification, the code-owned inventory of what every route IS. The expectations are
// DERIVED from the classification, so the gate distinguishes "public and declared" from "admin
// endpoint that happens to be a route file" — and adding a route forces a classification
// decision instead of letting it inherit "public" from its directory.
//
// The earlier version used an `UNDECLARED_BY_DESIGN` ignore list. That mechanism only records
// what someone remembered to exempt, and the natural way to silence it is to add an entry,
// which weakens the gate every time it fires. It is gone.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { expect, test } from "bun:test";

import { generateOpenApiDocument } from "./generate";
import {
  ROUTE_CLASSIFICATIONS,
  isPublicClassification,
  type RouteClassificationEntry,
} from "./route-classification";

const API_ROUTES_DIR = join(import.meta.dir, "..", "routes", "api");

/** Every .ts file under the API route tree, as inventory keys. */
function walkRouteKeys(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkRouteKeys(full));
    else if (entry.endsWith(".ts")) out.push(relative(API_ROUTES_DIR, full).split(sep).join("/"));
  }
  return out.sort();
}

/**
 * The HTTP methods a route file serves, read from its `handlers` object. OPTIONS is excluded
 * everywhere: it is CORS preflight plumbing, identical on every route, and not part of the
 * content contract.
 */
function handlerMethods(key: string): string[] {
  const source = readFileSync(join(API_ROUTES_DIR, key), "utf8");
  const methods = new Set<string>();
  for (const m of source.matchAll(/^\s{6}(GET|POST|PUT|PATCH|DELETE):/gm)) {
    methods.add(m[1].toLowerCase());
  }
  return [...methods].sort();
}

const document = generateOpenApiDocument();
const declared = document.paths ?? {};
const routeKeys = walkRouteKeys(API_ROUTES_DIR);

const classified = (key: string): RouteClassificationEntry | undefined =>
  ROUTE_CLASSIFICATIONS[key];

// ── The inventory itself must stay honest ───────────────────────────────────────────────────

test("the route tree is non-empty (guards against a broken walker)", () => {
  // Without this, a wrong API_ROUTES_DIR would make every coverage test below pass vacuously.
  expect(routeKeys.length).toBeGreaterThan(30);
});

test("every route file on disk is classified", () => {
  const unclassified = routeKeys.filter((k) => !classified(k));
  expect(
    unclassified,
    "Route files with no entry in src/openapi/route-classification.ts. Classify each one — " +
      "a route must not inherit 'public' from the directory it happens to live in.",
  ).toEqual([]);
});

test("every classified route still exists on disk", () => {
  const onDisk = new Set(routeKeys);
  const stale = Object.keys(ROUTE_CLASSIFICATIONS).filter((k) => !onDisk.has(k));
  expect(stale, "Inventory entries for deleted routes — remove them.").toEqual([]);
});

test("the recorded method set matches the handlers each file actually exports", () => {
  const mismatches: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry) continue; // reported above
    const actual = handlerMethods(key);
    if (actual.join(",") !== [...entry.methods].sort().join(",")) {
      mismatches.push(`${key}: handlers=[${actual}] but inventory says [${entry.methods}]`);
    }
  }
  expect(mismatches).toEqual([]);
});

test("a public route that is not documented must say why, and a private one must not be documented", () => {
  const problems: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry) continue;
    if (isPublicClassification(entry.classification) && !entry.inPublicOpenApi && !entry.note) {
      problems.push(`${key}: public but excluded from OpenAPI with no reason given`);
    }
    if (!isPublicClassification(entry.classification) && entry.inPublicOpenApi) {
      problems.push(`${key}: ${entry.classification} must not be in the public document`);
    }
  }
  expect(problems).toEqual([]);
});

test("every AUTHENTICATED_ADMIN_API actually carries a session guard", () => {
  // Classification is a claim; this checks the code backs it up.
  const unguarded: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (entry?.classification !== "AUTHENTICATED_ADMIN_API") continue;
    const source = readFileSync(join(API_ROUTES_DIR, key), "utf8");
    if (!/requireSession\s*\(/.test(source)) unguarded.push(key);
  }
  expect(
    unguarded,
    "Routes classified as authenticated admin APIs with no requireSession() call.",
  ).toEqual([]);
});

test("no public route silently requires a session (which would make it private)", () => {
  const misclassified: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry || !isPublicClassification(entry.classification)) continue;
    const source = readFileSync(join(API_ROUTES_DIR, key), "utf8");
    if (/requireSession\s*\(/.test(source)) misclassified.push(key);
  }
  expect(misclassified).toEqual([]);
});

// ── Document coverage, driven by the classification ─────────────────────────────────────────

test("every route marked inPublicOpenApi is present in the generated document", () => {
  const missing: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry?.inPublicOpenApi) continue;
    if (!(entry.path in declared)) missing.push(`${entry.path}  (${key})`);
  }
  expect(
    missing,
    "Public endpoints with no OpenAPI declaration. Add a route config to src/openapi/paths.ts " +
      "and a drift check — or, if it genuinely serves no typed JSON, set inPublicOpenApi:false " +
      "with a reason in the inventory.",
  ).toEqual([]);
});

test("every documented method matches a handler the route file actually exports", () => {
  const mismatches: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry?.inPublicOpenApi) continue;
    const documented = Object.keys(declared[entry.path] ?? {}).sort();
    const actual = handlerMethods(key);
    if (actual.join(",") !== documented.join(",")) {
      mismatches.push(`${entry.path}: handlers=[${actual}] but OpenAPI declares [${documented}]`);
    }
  }
  expect(mismatches, "OpenAPI method set drifted from the route handlers.").toEqual([]);
});

test("the document declares nothing that is not a route classified for it", () => {
  const publicPaths = new Set(
    Object.values(ROUTE_CLASSIFICATIONS)
      .filter((e) => e.inPublicOpenApi)
      .map((e) => e.path),
  );
  const phantom = Object.keys(declared).filter((p) => !publicPaths.has(p));
  expect(
    phantom,
    "OpenAPI declares an endpoint that no classified public route serves — consumers would " +
      "code against a 404, or an internal route was promoted by mistake.",
  ).toEqual([]);
});

test("no admin or auth route path leaks into the public document", () => {
  // Belt-and-braces over the classification check: catches a hand-written paths.ts entry that
  // points at an admin URL even if the inventory is momentarily wrong.
  const privatePaths = Object.values(ROUTE_CLASSIFICATIONS)
    .filter((e) => !isPublicClassification(e.classification))
    .map((e) => e.path);
  const leaked = privatePaths.filter((p) => p in declared);
  expect(leaked).toEqual([]);
});

// ── Contract-ownership rules on the documented surface ──────────────────────────────────────

test("every locale parameter uses the same en|vi|zh contract", () => {
  // Locale is a platform-wide contract, not a per-endpoint choice. A route that quietly accepts
  // a different set (or types it as a bare string) is how a future locale rollout turns into a
  // public DTO redesign.
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
  // The public API owns DTOs; the landing owns view models. Neither may depend on a column
  // name, a moderation-workflow field, or an unparsed JSON blob. Editorial `status` is included:
  // publication gating is applied server-side, so a public consumer must never branch on it.
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
    for (const value of Object.values(node as Record<string, unknown>)) scan(value, where);
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

test("site-settings exposes exactly today's fields — a new operator-config field must be a decision", () => {
  // `lead_form_destination` is operator configuration (an admin-set URL) on an unauthenticated
  // endpoint that NO landing code reads. It predates the contract freeze, and removing it is a
  // wire-shape change touching the landing's cmsSchemas.ts and cms-generated.d.ts — so it needs
  // the deprecation policy and an owner decision, not a quiet edit.
  //
  // This test does not bless it. It PINS the shape: the concern stays visible, the field cannot
  // be dropped without someone reading this comment, and no second config field can join it
  // unnoticed. See the route-classification note on this route.
  const schema = (
    declared["/api/v1/site-settings"] as {
      get?: {
        responses?: {
          200?: {
            content?: {
              "application/json"?: {
                schema?: { properties?: { settings?: { properties?: Record<string, unknown> } } };
              };
            };
          };
        };
      };
    }
  )?.get?.responses?.[200]?.content?.["application/json"]?.schema;

  const fields = Object.keys(schema?.properties?.settings?.properties ?? {}).sort();
  expect(fields).toEqual(
    [
      "about_video_url",
      "brand_name",
      "contact_email",
      "contact_phone",
      "default_og_image_id",
      "facebook_url",
      "fb_pixel_id",
      "ga4_id",
      "gtm_id",
      "lead_form_destination", // ← tracked concern, see above
      "logo_media_id",
      "og_image_url",
      "remote_area_links",
      "terminology",
      "tiktok_pixel_id",
    ].sort(),
  );
});

test("every error response uses the bounded { error } envelope", () => {
  // A raw provider or database message must never reach a public consumer.
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

// ── Inventory hygiene ───────────────────────────────────────────────────────────────────────

test("every unconventional decision in the inventory carries a written reason", () => {
  // A public route kept out of the document, a non-standard auth mode, or a route with no
  // consumer are each judgement calls. Requiring a note is what stops the inventory decaying
  // into the ignore list it replaced.
  const undocumented: string[] = [];
  for (const [key, entry] of Object.entries(ROUTE_CLASSIFICATIONS)) {
    const unconventional =
      (isPublicClassification(entry.classification) && !entry.inPublicOpenApi) ||
      entry.auth === "owner-token" ||
      entry.classification === "INTERNAL_OPERATION" ||
      entry.classification === "WEBHOOK";
    if (unconventional && !entry.note) undocumented.push(key);
  }
  expect(undocumented).toEqual([]);
});
