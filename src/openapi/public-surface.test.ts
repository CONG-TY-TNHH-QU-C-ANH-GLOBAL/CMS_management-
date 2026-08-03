// THE contract-freeze gate.
//
// It answers one question: does the public API this Worker actually serves match the contract
// this repository claims? Three sources are compared — the route modules on disk, the
// code-owned classification inventory, and the generated OpenAPI document — and every
// disagreement is a failure.
//
// Two things changed after review, both because the previous gate proved less than it claimed:
//
//   1. METHODS AND AUTHORIZATION ARE READ FROM THE REAL MODULES. The gate used to grep route
//      files for `^      GET:` and `requireSession(`. Source text is not a security boundary:
//      a comment, a string literal, a reformat, an alias or dead code all change the answer.
//      It now imports each route module and reads `Route.options.server.handlers` — the object
//      the router registers — and reads the enforced role off the handler value itself, which
//      `withRequiredSession` brands at the same moment it performs the check.
//   2. DOCUMENT TRAVERSAL GOES THROUGH src/openapi/document. Path Items may carry `$ref`,
//      `summary`, `servers` and `parameters`, and response keys may be `default` or `4XX`.
//      Treating every path-item key as a method invented operations; `Number(status) < 400`
//      silently skipped every non-numeric key. One canonical utility now owns both.

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { expect, mock, test } from "bun:test";

// The route modules reach `cloudflare:workers` through the CORS helper, which does not exist
// outside the Worker runtime. Stubbing it is what lets this gate inspect the REAL handler
// objects instead of the files' text. Nothing is asserted against the stub.
mock.module("cloudflare:workers", () => ({ env: {} }));

// Imported from cors-origin, not cors: this module must load without the `cloudflare:workers`
// binding, exactly like `requiredRoleOf` below.
import { hasMutationOriginBoundary } from "@/core/middlewares/cors-origin";
import { requiredRoleOf } from "@/features/auth/auth.guard";
import type { Role } from "@/features/auth/auth.session";

import { CONTRACT_BINDINGS, checkContractBindings } from "./contract-bindings";
import {
  HTTP_METHODS,
  classifyResponseStatus,
  compareContractKeys,
  compareHttpMethods,
  findLocaleEnumViolations,
  findParameterPolicyViolations,
  openApiOperations,
  unknownPathItemKeys,
  type HttpMethod,
  type OpenApiDocumentLike,
  type PathItem,
} from "./document";
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
  // Route-file keys are contract key strings — canonical, host-independent order.
  return out.sort(compareContractKeys);
}

const routeKeys = walkRouteKeys(API_ROUTES_DIR);
const classified = (key: string): RouteClassificationEntry | undefined =>
  ROUTE_CLASSIFICATIONS[key];

interface LoadedRoute {
  /** Methods the registered handler object actually exposes, excluding OPTIONS. */
  methods: HttpMethod[];
  /** Enforced role per method, read from the branded handler. null = not a guarded handler. */
  roles: Map<HttpMethod, Role | null>;
  /** Whether each method's handler carries the CMS-P1 mutation-origin boundary, read from the
   *  same handler value — not from the file's text. */
  boundaries: Map<HttpMethod, boolean>;
}

/**
 * Load a route module and read what it REGISTERS.
 *
 * OPTIONS is excluded everywhere: it is CORS preflight plumbing, identical on every route, and
 * not part of the content contract.
 */
async function loadRoute(key: string): Promise<LoadedRoute> {
  const module = (await import(join(API_ROUTES_DIR, key))) as {
    Route?: { options?: { server?: { handlers?: Record<string, unknown> } } };
  };
  const handlers = module.Route?.options?.server?.handlers ?? {};
  const methods: HttpMethod[] = [];
  const roles = new Map<HttpMethod, Role | null>();
  const boundaries = new Map<HttpMethod, boolean>();

  for (const [name, handler] of Object.entries(handlers)) {
    const method = name.toLowerCase();
    if (method === "options") continue;
    if (!(HTTP_METHODS as readonly string[]).includes(method)) continue;
    methods.push(method as HttpMethod);
    roles.set(method as HttpMethod, requiredRoleOf(handler));
    boundaries.set(method as HttpMethod, hasMutationOriginBoundary(handler));
  }
  // Canonical HTTP order, matching openApiOperations, so the three sources compare directly.
  methods.sort(compareHttpMethods);
  return { methods, roles, boundaries };
}

const loadedRoutes = new Map<string, LoadedRoute>(
  await Promise.all(routeKeys.map(async (key) => [key, await loadRoute(key)] as const)),
);

// The generator's own PathItemObject type is narrower than the document a policy check must
// tolerate, so both views are taken once here.
const document = generateOpenApiDocument() as unknown as OpenApiDocumentLike;
const declared = (document.paths ?? {}) as Record<string, PathItem>;

// ── Schema identity ─────────────────────────────────────────────────────────────────────────

test("the contract-binding gate passes, and fails closed on an empty table", () => {
  // Same function `bun run check:openapi-drift` calls, so the CLI and the suite cannot
  // diverge — which is how a gate validating zero bindings could once report success.
  expect(checkContractBindings().map((f) => f.message)).toEqual([]);
  expect(CONTRACT_BINDINGS.length).toBeGreaterThan(40);

  const empty = checkContractBindings([]);
  expect(empty).toHaveLength(1);
  expect(empty[0].kind).toBe("empty-binding-set");
});

test("every documented operation has a schema binding", () => {
  const bound = new Set(CONTRACT_BINDINGS.map((b) => b.name.replace(/ → .*$/, "")));
  const unbound: string[] = [];
  for (const [path, item] of Object.entries(declared)) {
    for (const [method] of openApiOperations(item)) {
      const id = `${method.toUpperCase()} ${path}`;
      if (!bound.has(id)) unbound.push(id);
    }
  }
  expect(
    unbound,
    "Documented operations with no entry in src/openapi/contract-bindings.ts — their schema " +
      "can drift from the canonical feature export undetected.",
  ).toEqual([]);
});

// ── The inventory itself must stay honest ───────────────────────────────────────────────────

test("the route tree is non-empty (guards against a broken walker)", () => {
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

test("the recorded method set matches the handlers the module actually REGISTERS", () => {
  const mismatches: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry) continue;
    const actual = loadedRoutes.get(key)!.methods;
    if (actual.join(",") !== [...entry.methods].sort(compareHttpMethods).join(",")) {
      mismatches.push(`${key}: registers [${actual}] but inventory says [${entry.methods}]`);
    }
  }
  expect(mismatches).toEqual([]);
});

test("every route registers at least one non-OPTIONS handler", () => {
  // A route file that exports no usable handler is either dead or misread by the loader; both
  // would make every method assertion above vacuously true for it.
  const empty = routeKeys.filter((key) => loadedRoutes.get(key)!.methods.length === 0);
  expect(empty).toEqual([]);
});

test("every entry names a consumer", () => {
  // The inventory has no "unconsumed" state and no route is unconsumed today, so the rule is
  // simply that a consumer must be named. (An earlier comment claimed a route with no consumer
  // needed a written note; nothing enforced it and no entry used it — the prose was wrong, and
  // inventing a sentinel for a state that does not exist would have been worse.)
  const missing = Object.entries(ROUTE_CLASSIFICATIONS)
    .filter(([, entry]) => entry.consumer.trim().length === 0)
    .map(([key]) => key);
  expect(missing).toEqual([]);
});

// ── Authorization, read from the registered handler ─────────────────────────────────────────

test("every AUTHENTICATED_ADMIN_API handler is a guarded handler carrying its role", () => {
  const problems: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (entry?.classification !== "AUTHENTICATED_ADMIN_API") continue;
    for (const [method, role] of loadedRoutes.get(key)!.roles) {
      if (role === null) {
        problems.push(`${key} ${method.toUpperCase()}: not wrapped in withRequiredSession`);
      }
    }
  }
  expect(
    problems,
    "An admin route must compose its handler with withRequiredSession(role, …). That call IS " +
      "the session check, so the brand cannot be present without the check running.",
  ).toEqual([]);
});

test("no route classified public carries an authorization brand", () => {
  const misclassified: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry || !isPublicClassification(entry.classification)) continue;
    for (const [method, role] of loadedRoutes.get(key)!.roles) {
      if (role !== null) misclassified.push(`${key} ${method.toUpperCase()} enforces ${role}`);
    }
  }
  expect(misclassified).toEqual([]);
});

test("the brand cannot be forged by a comment, a string, or an unwrapped function", () => {
  // These are the exact shapes that satisfied the old source-text check. The property this
  // gate reads is a symbol set by withRequiredSession itself, so none of them can produce it.
  const comment = () => {
    // requireSession("admin")
    return new Response(null);
  };
  const stringLiteral = () => new Response('requireSession("admin")');
  const plain = async () => new Response(null);

  for (const candidate of [comment, stringLiteral, plain]) {
    expect(requiredRoleOf(candidate)).toBeNull();
  }
  expect(requiredRoleOf('requireSession("admin")')).toBeNull();
  expect(requiredRoleOf(undefined)).toBeNull();
});

// ── Browser mutation boundary (CMS-P1), read from the registered handler ────────────────────
//
// The classification owns the invariant: a route recorded as PUBLIC_WRITE_API is by definition a
// public state-changing endpoint, so its state-changing handlers must carry the boundary. Adding
// a new public write therefore forces the decision — the entry cannot be filed without the gate
// demanding the guard, and the guard cannot be claimed without the wrapper that performs it.

/** State-changing methods. GET is a read and never carries the boundary. */
const MUTATING_METHODS: readonly HttpMethod[] = HTTP_METHODS.filter(
  (m) => m !== "get",
) as HttpMethod[];

test("every PUBLIC_WRITE_API state-changing handler carries the mutation-origin boundary", () => {
  const unguarded: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (entry?.classification !== "PUBLIC_WRITE_API") continue;
    for (const [method, guarded] of loadedRoutes.get(key)!.boundaries) {
      if (!MUTATING_METHODS.includes(method)) continue;
      if (!guarded) unguarded.push(`${key} ${method.toUpperCase()}`);
    }
  }
  expect(
    unguarded,
    "A public write must compose its handler with withMutationOriginBoundary(…). That call IS " +
      "the origin check, so the brand cannot be present without the check running — and a " +
      "disallowed browser origin must never reach rate limiting, Turnstile or a store write.",
  ).toEqual([]);
});

test("the boundary is actually wired somewhere (guards against a vacuous pass)", () => {
  const guarded = routeKeys.flatMap((key) =>
    [...loadedRoutes.get(key)!.boundaries].filter(([, on]) => on).map(([m]) => `${key} ${m}`),
  );
  // Eight public writes are inventoried; if the loader or the brand silently broke, the
  // assertion above would pass with an empty set and prove nothing.
  expect(guarded.length).toBe(8);
});

test("no read handler carries the mutation-origin boundary", () => {
  // Reads must be untouched by CMS-P1 — including the GET side of the two readWrite routes.
  const branded: string[] = [];
  for (const key of routeKeys) {
    if (loadedRoutes.get(key)!.boundaries.get("get")) branded.push(`${key} GET`);
  }
  expect(branded).toEqual([]);
});

test("the boundary brand cannot be forged by a comment, a string, or an unwrapped function", () => {
  const comment = () => {
    // withMutationOriginBoundary(...)
    return new Response(null);
  };
  const stringLiteral = () => new Response("withMutationOriginBoundary(");
  const plain = async () => new Response(null);

  for (const candidate of [comment, stringLiteral, plain]) {
    expect(hasMutationOriginBoundary(candidate)).toBe(false);
  }
  expect(hasMutationOriginBoundary("withMutationOriginBoundary(")).toBe(false);
  expect(hasMutationOriginBoundary(undefined)).toBe(false);
  expect(hasMutationOriginBoundary({ [Symbol.for("thg.cors.mutationOriginBoundary")]: true })).toBe(
    false,
  );
});

// ── Document coverage, driven by the classification ─────────────────────────────────────────

test("every route marked inPublicOpenApi is present in the generated document", () => {
  const missing: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry?.inPublicOpenApi) continue;
    if (!(entry.path in declared)) missing.push(`${entry.path}  (${key})`);
  }
  expect(missing).toEqual([]);
});

test("every documented method matches a handler the module registers", () => {
  const mismatches: string[] = [];
  for (const key of routeKeys) {
    const entry = classified(key);
    if (!entry?.inPublicOpenApi) continue;
    // openApiOperations already returns canonical HTTP order, so no re-sort is needed.
    const documented = openApiOperations(declared[entry.path] ?? {}).map(([method]) => method);
    const actual = loadedRoutes.get(key)!.methods;
    if (actual.join(",") !== documented.join(",")) {
      mismatches.push(`${entry.path}: registers [${actual}] but OpenAPI declares [${documented}]`);
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
  expect(Object.keys(declared).filter((p) => !publicPaths.has(p))).toEqual([]);
});

test("no admin or auth route path leaks into the public document", () => {
  const privatePaths = Object.values(ROUTE_CLASSIFICATIONS)
    .filter((e) => !isPublicClassification(e.classification))
    .map((e) => e.path);
  expect(privatePaths.filter((p) => p in declared)).toEqual([]);
});

test("a public route that is not documented must say why, and a private one must not be documented", () => {
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(ROUTE_CLASSIFICATIONS)) {
    if (isPublicClassification(entry.classification) && !entry.inPublicOpenApi && !entry.note) {
      problems.push(`${key}: public but excluded from OpenAPI with no reason given`);
    }
    if (!isPublicClassification(entry.classification) && entry.inPublicOpenApi) {
      problems.push(`${key}: ${entry.classification} must not be in the public document`);
    }
  }
  expect(problems).toEqual([]);
});

// ── Document shape policy ───────────────────────────────────────────────────────────────────

test("no path item carries a key this gate does not understand", () => {
  // Neither a supported method nor known metadata. A `head`/`trace` operation or an unexpected
  // extension lands here rather than being silently skipped.
  const unknown: string[] = [];
  for (const [path, item] of Object.entries(declared)) {
    for (const key of unknownPathItemKeys(item)) unknown.push(`${path} → ${key}`);
  }
  expect(unknown).toEqual([]);
});

test("PARAMETER REFERENCES AND COMPONENTS ARE PROHIBITED — every parameter is inline", () => {
  // Policy decision, not an omission — see findParameterPolicyViolations for the reasoning and
  // src/openapi/document.test.ts for the negative cases.
  expect(
    findParameterPolicyViolations(document),
    "Referenced or path-level parameters are not supported by this contract. Declare the " +
      "parameter inline on the operation, or change this policy deliberately and teach the " +
      "locale check to resolve references.",
  ).toEqual([]);
});

test("every effective lang parameter is exactly the en|vi|zh contract", () => {
  // Inspecting operation-level inline parameters IS complete coverage, because the test above
  // rejects every other declaration form. The claim and the coverage match.
  expect(findLocaleEnumViolations(document)).toEqual([]);
});

test("every response key is an exact numeric status — ranges and `default` are prohibited", () => {
  // The previous check used `Number(status) < 400`, and `Number("default")` is NaN, so
  // `default`, `2XX`, `4XX` and `5XX` were all silently treated as "not an error" and skipped.
  // Passing was an accident of NaN. classifyResponseStatus states the policy instead.
  const unsupported: string[] = [];
  for (const [path, item] of Object.entries(declared)) {
    for (const [method, operation] of openApiOperations(item)) {
      for (const key of Object.keys(operation.responses ?? {})) {
        const classification = classifyResponseStatus(key);
        if (classification.kind === "unsupported") {
          unsupported.push(`${method.toUpperCase()} ${path} → "${key}": ${classification.reason}`);
        }
      }
    }
  }
  expect(unsupported).toEqual([]);
});

test("every error response uses the bounded { error } envelope", () => {
  // A raw provider or database message must never reach a public consumer.
  const offenders: string[] = [];
  for (const [path, item] of Object.entries(declared)) {
    for (const [method, operation] of openApiOperations(item)) {
      for (const [key, body] of Object.entries(operation.responses ?? {})) {
        if (classifyResponseStatus(key).kind !== "error") continue;
        const schema = (
          body as {
            content?: {
              "application/json"?: { schema?: { properties?: Record<string, unknown> } };
            };
          }
        ).content?.["application/json"]?.schema;
        const keys = Object.keys(schema?.properties ?? {});
        if (keys.length !== 1 || keys[0] !== "error") {
          offenders.push(`${method.toUpperCase()} ${path} → ${key}: [${keys}]`);
        }
      }
    }
  }
  expect(offenders).toEqual([]);
});

test("no public response shape exposes an internal or raw-database field", () => {
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
    if (seen.has(node)) return;
    seen.add(node);
    const props = (node as { properties?: Record<string, unknown> }).properties;
    if (props) {
      for (const key of Object.keys(props)) {
        if (FORBIDDEN.includes(key)) leaks.push(`${where} → ${key}`);
      }
    }
    for (const value of Object.values(node as Record<string, unknown>)) scan(value, where);
  }

  for (const [path, item] of Object.entries(declared)) {
    for (const [method, operation] of openApiOperations(item)) {
      for (const [key, body] of Object.entries(operation.responses ?? {})) {
        scan(body, `${method.toUpperCase()} ${path} → ${key}`);
      }
    }
  }

  expect(leaks, "Internal field reached a public response schema.").toEqual([]);
});

test("site-settings exposes exactly the approved fields and no operator configuration", () => {
  // `lead_form_destination` was REMOVED from this response: operator configuration (an
  // admin-set URL naming where leads are routed) published on an unauthenticated endpoint with
  // no consumer in either landing app. The list is asserted EXACTLY so the removal cannot
  // regress and no second config field can join unnoticed. Analytics ids stay — they are
  // rendered into the browser anyway.
  const [, operation] = openApiOperations(declared["/api/v1/site-settings"] ?? {})[0] ?? [];
  const schema = (
    operation?.responses?.["200"] as {
      content?: {
        "application/json"?: {
          schema?: { properties?: { settings?: { properties?: Record<string, unknown> } } };
        };
      };
    }
  )?.content?.["application/json"]?.schema;

  const fields = Object.keys(schema?.properties?.settings?.properties ?? {}).sort(
    compareContractKeys,
  );
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
      "logo_media_id",
      "og_image_url",
      "remote_area_links",
      "terminology",
      "tiktok_pixel_id",
    ].sort(compareContractKeys),
  );
  expect(fields).not.toContain("lead_form_destination");
});

// ── Inventory hygiene ───────────────────────────────────────────────────────────────────────

test("every unconventional decision in the inventory carries a written reason", () => {
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
