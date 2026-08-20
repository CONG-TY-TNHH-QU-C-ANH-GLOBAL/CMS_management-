// Code-owned classification of EVERY server route in this Worker.
//
// The first version of the public-surface gate had an `UNDECLARED_BY_DESIGN` ignore list. That
// is the wrong mechanism: an ignore list only records the routes someone remembered to exempt,
// it says nothing about the rest, it cannot tell "public and declared" from "admin endpoint
// that happens to be a route file", and the natural way to silence it is to add an entry — so
// it gets weaker every time it fires.
//
// This inventory inverts that. Every route file must appear here, and the gate DERIVES its
// expectations from the classification:
//
//   PUBLIC_CONTENT_API / PUBLIC_WRITE_API  → MUST be in the OpenAPI document, methods must
//                                            match the handlers, error bodies must be the
//                                            bounded `{ error }` envelope, a `lang` parameter
//                                            must be the platform en|vi|zh contract, and no
//                                            internal/database field may appear in a response.
//   AUTHENTICATED_ADMIN_API                → MUST NOT be in the public document, and MUST
//                                            carry a session guard.
//   AUTH_CALLBACK / WEBHOOK /              → MUST NOT be in the public document.
//   INTERNAL_OPERATION / HEALTH_OR_DIAGNOSTIC
//
// A file missing from this inventory fails the gate; a listed file that no longer exists fails
// too. Adding a route therefore forces a classification decision rather than silently
// inheriting "public" from its directory. `(public)` is a TanStack ROUTE GROUP — it shapes the
// URL, not the trust boundary.
//
// SHAPE: entries are built through small per-classification factories rather than written as
// 38 object literals. Sonar measured 266 duplicated lines here, and all of it was repeated KEY
// NAMES — `classification:`, `auth:`, `inPublicOpenApi:` restated for every route. The
// factories carry those invariants once, so each route below states only what is specific to
// it, and a route cannot be misfiled by omission: a `read(...)` is public, unauthenticated and
// documented BY CONSTRUCTION. This is data with typed constructors, not a framework — no
// dispatch, no registry lookup, no behavior.
//
// What this file must NEVER own: request/response schemas. Those stay feature-owned
// (features/<f>/<f>.schemas.ts) and are wired into operations in src/openapi/paths.ts.

export type RouteClassification =
  | "PUBLIC_CONTENT_API"
  | "PUBLIC_WRITE_API"
  | "AUTHENTICATED_ADMIN_API"
  | "INTERNAL_OPERATION"
  | "AUTH_CALLBACK"
  | "WEBHOOK"
  | "HEALTH_OR_DIAGNOSTIC";

export type AuthRequirement =
  /** No credential. Abuse control is rate limiting and/or Turnstile, not identity. */
  | "none"
  /** Session cookie via requireSession(role). */
  | "session"
  /** The caller proves ownership with a submission-time opaque token, not an account. */
  | "owner-token";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface RouteClassificationEntry {
  /** Public URL the file serves, with TanStack params as {name}. */
  path: string;
  /** Methods the handler exports, excluding OPTIONS (CORS preflight, identical everywhere). */
  methods: readonly HttpMethod[];
  classification: RouteClassification;
  auth: AuthRequirement;
  /** Whether this route belongs in the PUBLIC OpenAPI document. */
  inPublicOpenApi: boolean;
  owningFeature: string;
  /** Who calls it. Every route in this Worker has a consumer today, so there is no
   *  "unconsumed" state and no sentinel for one — the gate simply requires a named consumer.
   *  If a genuinely unconsumed route ever appears, model the absence explicitly rather than
   *  encoding it as free text. */
  consumer: string;
  /** Required whenever a public route is NOT documented, or a shape needs a caveat. */
  note?: string;
}

// ── Per-classification factories ────────────────────────────────────────────────────────────

const read = (
  path: string,
  owningFeature: string,
  consumer: string,
  note?: string,
): RouteClassificationEntry => ({
  path,
  methods: ["get"],
  classification: "PUBLIC_CONTENT_API",
  auth: "none",
  inPublicOpenApi: true,
  owningFeature,
  consumer,
  note,
});

const write = (
  path: string,
  owningFeature: string,
  consumer: string,
  note: string,
  auth: AuthRequirement = "none",
): RouteClassificationEntry => ({
  path,
  methods: ["post"],
  classification: "PUBLIC_WRITE_API",
  auth,
  inPublicOpenApi: true,
  owningFeature,
  consumer,
  note,
});

/** One path serving both a public read and a moderated public write. Classified by the
 *  stronger of the two. */
const readWrite = (
  path: string,
  owningFeature: string,
  consumer: string,
  note: string,
): RouteClassificationEntry => ({
  path,
  methods: ["get", "post"],
  classification: "PUBLIC_WRITE_API",
  auth: "none",
  inPublicOpenApi: true,
  owningFeature,
  consumer,
  note,
});

/** Classifications `undocumented()` may construct.
 *
 *  The helper hardcodes `auth: "none"`, so it must not accept a classification that implies a
 *  credential — an AUTHENTICATED_ADMIN_API recorded as unauthenticated is exactly the
 *  impossible state the inventory exists to prevent. Narrowed to the two the callers actually
 *  use (the binary media proxy and the OpenAPI document route), both genuinely unauthenticated.
 *  Widen it only alongside an auth parameter. */
type UnauthenticatedClassification = "PUBLIC_CONTENT_API" | "HEALTH_OR_DIAGNOSTIC";

/** Public or diagnostic in fact, but serving no typed JSON — so it cannot be documented.
 *  `note` is MANDATORY here, not optional: this is the only shape that could decay into an
 *  ignore list. */
const undocumented = (
  path: string,
  classification: UnauthenticatedClassification,
  owningFeature: string,
  consumer: string,
  note: string,
): RouteClassificationEntry => ({
  path,
  methods: ["get"],
  classification,
  auth: "none",
  inPublicOpenApi: false,
  owningFeature,
  consumer,
  note,
});

const adminApi = (
  path: string,
  methods: readonly HttpMethod[],
  owningFeature: string,
  consumer: string,
  note: string,
): RouteClassificationEntry => ({
  path,
  methods,
  classification: "AUTHENTICATED_ADMIN_API",
  auth: "session",
  inPublicOpenApi: false,
  owningFeature,
  consumer,
  note,
});

const authCallback = (path: string, consumer: string, note: string): RouteClassificationEntry => ({
  path,
  methods: ["get"],
  classification: "AUTH_CALLBACK",
  auth: "none",
  inPublicOpenApi: false,
  owningFeature: "auth",
  consumer,
  note,
});

const LANDING = "THG_landingpage";

/** Keyed by path relative to `src/routes/api/`, forward slashes, with the .ts extension. */
export const ROUTE_CLASSIFICATIONS: Readonly<Record<string, RouteClassificationEntry>> = {
  // ── Public content reads ──────────────────────────────────────────────────────────────────
  "v1/(public)/blog/index.ts": read("/api/v1/blog", "blog", `${LANDING} blog list`),
  "v1/(public)/blog/$slug.ts": read("/api/v1/blog/{slug}", "blog", `${LANDING} blog detail`),
  "v1/(public)/blog/categories.ts": read(
    "/api/v1/blog/categories",
    "blog",
    `${LANDING} blog list filter`,
  ),
  "v1/(public)/community/categories/index.ts": read(
    "/api/v1/community/categories",
    "community",
    `${LANDING} community filter chips`,
  ),
  "v1/(public)/community/questions/$slug.ts": read(
    "/api/v1/community/questions/{slug}",
    "community",
    `${LANDING} question detail`,
  ),
  "v1/(public)/community/reviews/$slug.ts": read(
    "/api/v1/community/reviews/{slug}",
    "community",
    `${LANDING} review detail`,
  ),
  "v1/(public)/contact-locations/index.ts": read(
    "/api/v1/contact-locations",
    "content",
    `${LANDING} global shell footer`,
  ),
  "v1/(public)/faqs/index.ts": read(
    "/api/v1/faqs",
    "content",
    `${LANDING} home + service FAQ sections`,
  ),
  "v1/(public)/homepage/index.ts": read("/api/v1/homepage", "homepage", `${LANDING} homepage`),
  "v1/(public)/integrations/index.ts": read(
    "/api/v1/integrations",
    "content",
    `${LANDING} homepage integrations strip`,
  ),
  "v1/(public)/partners/index.ts": read(
    "/api/v1/partners",
    "partners",
    `${LANDING} homepage partner strip`,
  ),
  "v1/(public)/jobs/index.ts": read("/api/v1/jobs", "careers", `${LANDING} careers list`),
  "v1/(public)/jobs/$slug.ts": read("/api/v1/jobs/{slug}", "careers", `${LANDING} job detail`),
  "v1/(public)/marquee-images/index.ts": read(
    "/api/v1/marquee-images",
    "content",
    `${LANDING} homepage marquee`,
  ),
  "v1/(public)/policies/index.ts": read("/api/v1/policies", "policies", `${LANDING} /policy`),
  "v1/(public)/policies/$slug.ts": read(
    "/api/v1/policies/{slug}",
    "policies",
    `${LANDING} /policy`,
  ),
  "v1/(public)/pricing/index.ts": read("/api/v1/pricing", "pricing", `${LANDING} pricing routes`),
  "v1/(public)/pricing/$slug.ts": read(
    "/api/v1/pricing/{slug}",
    "pricing",
    `${LANDING} pricing routes`,
  ),
  "v1/(public)/service-blocks/index.ts": read(
    "/api/v1/service-blocks",
    "content",
    `${LANDING} THG Order + Next service routes`,
  ),
  "v1/(public)/services/index.ts": read("/api/v1/services", "content", `${LANDING} service routes`),
  "v1/(public)/shipping-routes/index.ts": read(
    "/api/v1/shipping-routes",
    "shipping",
    `${LANDING} /shipping-policy`,
  ),
  "v1/(public)/shipping-routes/$slug.ts": read(
    "/api/v1/shipping-routes/{slug}",
    "shipping",
    `${LANDING} /shipping-policy`,
  ),
  "v1/(public)/testimonials/index.ts": read(
    "/api/v1/testimonials",
    "content",
    `${LANDING} homepage testimonials`,
  ),
  "v1/(public)/translations/index.ts": read(
    "/api/v1/translations",
    "i18n",
    `${LANDING} marketing-copy overlay`,
  ),

  "v1/(public)/site-settings/index.ts": read(
    "/api/v1/site-settings",
    "settings",
    `${LANDING} global shell (brand, contact, analytics ids)`,
    "`lead_form_destination` was REMOVED from this response (owner-approved security " +
      "correction). It is operator configuration — an admin-set URL naming where leads are " +
      "routed — that was published on an unauthenticated endpoint with NO reader in either " +
      "landing app, so publishing it only let someone discover and target the destination. " +
      "The column and the admin editor are unchanged; only the public projection dropped it. " +
      "The landing's cmsSchemas.ts still declares the field as nullable, so it keeps parsing " +
      "the narrower body. The exact remaining field set is pinned by a test so the removal " +
      "cannot regress and no second config field can join unnoticed.",
  ),
  "v1/(public)/sitemap/index.ts": read(
    "/api/v1/sitemap",
    "content",
    `${LANDING} sitemap generation (build-time), not a browser`,
    "Returns only status='live' rows, so it publishes nothing a crawler could not already " +
      "reach. Build-time-only consumption does not make it internal: it is unauthenticated and " +
      "CORS-enabled, so it is public in fact and is contracted as such.",
  ),

  // ── Public writes ─────────────────────────────────────────────────────────────────────────
  "v1/(public)/community/questions/index.ts": readWrite(
    "/api/v1/community/questions",
    "community",
    `${LANDING} community list + ask dialog`,
    "GET is a content read; POST is the moderated submission. Classified by the stronger.",
  ),
  "v1/(public)/community/reviews/index.ts": readWrite(
    "/api/v1/community/reviews",
    "community",
    `${LANDING} reviews list + submit dialog`,
    "GET is a content read; POST is the moderated submission. Classified by the stronger.",
  ),
  "v1/(public)/leads/index.ts": write(
    "/api/v1/leads",
    "leads",
    `${LANDING} lead dialog, homepage form, every service form`,
    "Turnstile + 10/IP/hour. The single canonical lead endpoint.",
  ),
  "v1/(public)/applicants/index.ts": write(
    "/api/v1/applicants",
    "careers",
    `${LANDING} job application dialog`,
    "Turnstile + 5/IP/hour.",
  ),
  "v1/(public)/applicant-cv/index.ts": write(
    "/api/v1/applicant-cv",
    "careers",
    `${LANDING} job application dialog`,
    "Writes to the PRIVATE `applicants/` namespace and returns the AUTHENTICATED retrieval " +
      "URL (/api/v1/applicant-cv/{key}), never a public bearer URL. The 128-bit " +
      "crypto.getRandomValues key is a collision-resistant private identifier only — it is no " +
      "longer the access control, which it was previously described as and never was. " +
      "STILL OPEN: this is an unauthenticated R2 write with NO Turnstile (only 5/IP/hour plus " +
      "MIME and 10MB caps) while every sibling public write verifies one. Adding it changes " +
      "the request contract and needs a coordinated landing change, so it stays reported.",
  ),
  "v1/(public)/community/questions/$slug.same-issue.ts": write(
    "/api/v1/community/questions/{slug}/same-issue",
    "community",
    `${LANDING} question detail reaction`,
    "No Turnstile by design (one-click UX); hashed IP is the dedupe identity, 30/IP/hour.",
  ),
  "v1/(public)/community/questions/$slug.withdraw.ts": write(
    "/api/v1/community/questions/{slug}/withdraw",
    "community",
    `${LANDING} withdraw button`,
    "Owner token is authorization without an account; a wrong token gets the generic 404.",
    "owner-token",
  ),
  "v1/(public)/community/reviews/$slug.withdraw.ts": write(
    "/api/v1/community/reviews/{slug}/withdraw",
    "community",
    `${LANDING} withdraw button`,
    "Same owner-token contract and generic-404 policy as the question withdraw route.",
    "owner-token",
  ),

  // ── Public, but not typed JSON ────────────────────────────────────────────────────────────
  "v1/(public)/media/$.ts": undocumented(
    "/api/v1/media/{splat}",
    "PUBLIC_CONTENT_API",
    "media",
    `${LANDING} <img> tags; applicant CV links`,
    "Not in the document because it returns image/document BYTES over an unbounded splat key — " +
      "there is no response schema to type, and consumers use it as a URL. It now REFUSES the " +
      "private `applicants/` namespace (404, so it cannot be used to probe which keys exist); " +
      "applicant CVs are served only by the authenticated /api/v1/applicant-cv/{splat} route. " +
      "This proxy is the sole public exposure of the R2 bucket — wrangler.jsonc binds MEDIA " +
      "with no public bucket domain — so the deny is a complete boundary, not a speed bump.",
  ),
  "v1/(public)/openapi/index.ts": undocumented(
    "/api/v1/openapi",
    "HEALTH_OR_DIAGNOSTIC",
    "openapi",
    `${LANDING} type codegen; API consumers`,
    "Serves the document itself; declaring it inside itself is circular. It exposes only the " +
      "public surface — the registry never receives an admin or auth route.",
  ),

  // ── Not public ────────────────────────────────────────────────────────────────────────────
  "v1/(admin)/media/upload.ts": adminApi(
    "/api/v1/media/upload",
    ["post"],
    "media",
    "CMS admin Media Library (same-origin, no CORS)",
    "withRequiredSession('editor'). Must never enter the public document.",
  ),
  "v1/(admin)/applicant-cv/$.ts": adminApi(
    "/api/v1/applicant-cv/{splat}",
    ["get"],
    "careers",
    "CMS admin applicants table (same-origin, no CORS)",
    "The ONLY way to read an applicant CV. withRequiredSession('viewer') — the same level " +
      "that already returns the applicant's name, email, phone and cover letter, so the CV " +
      "inherits the authorization of the record it belongs to. Streams with " +
      "Cache-Control: private, no-store, Content-Disposition: attachment and nosniff, and " +
      "answers a uniform 404 for an out-of-namespace key or a missing object so neither " +
      "reveals what exists in storage.",
  ),
  "auth/google/start.ts": authCallback(
    "/api/auth/google/start",
    "CMS admin login redirect",
    "Begins the OAuth flow and sets state/redirect cookies. Rate limited 10/60s per IP.",
  ),
  "auth/google/callback.ts": authCallback(
    "/api/auth/google/callback",
    "Google OAuth redirect",
    "Exchanges the code and issues the session cookie. Never a documented API.",
  ),
};

/** Classifications whose routes MUST appear in the public OpenAPI document. */
export const PUBLIC_CLASSIFICATIONS: readonly RouteClassification[] = [
  "PUBLIC_CONTENT_API",
  "PUBLIC_WRITE_API",
];

export function isPublicClassification(c: RouteClassification): boolean {
  return PUBLIC_CLASSIFICATIONS.includes(c);
}
