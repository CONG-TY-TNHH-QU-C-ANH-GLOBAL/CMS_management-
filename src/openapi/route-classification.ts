// Code-owned classification of EVERY server route in this Worker.
//
// The first version of the public-surface gate had an `UNDECLARED_BY_DESIGN` ignore list. That
// is the wrong mechanism: an ignore list only records the routes someone remembered to exempt,
// and it says nothing about the routes it does not mention. It cannot distinguish "this is
// public and declared" from "this is an admin endpoint that happens to live in a route file",
// so the natural way to silence it is to add another entry — which weakens the gate every time
// it fires.
//
// This inventory inverts that. Every route file must appear here with an explicit
// classification, and the gate derives its expectations FROM the classification:
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
// A file missing from this inventory fails the gate. A file listed here that no longer exists
// fails the gate. Adding a route therefore forces a classification decision rather than
// silently inheriting "public" from its directory.
//
// `(public)` in the path is a TanStack ROUTE GROUP — it shapes the URL, not the trust boundary.
// A route is public because it is classified public here and has no auth guard, not because of
// where its file sits.

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

export interface RouteClassificationEntry {
  /** Public URL the file serves, with TanStack params as {name}. */
  path: string;
  /** Methods the handler exports, excluding OPTIONS (CORS preflight, identical everywhere). */
  methods: readonly ("get" | "post" | "put" | "patch" | "delete")[];
  classification: RouteClassification;
  auth: AuthRequirement;
  /** Whether this route belongs in the PUBLIC OpenAPI document. */
  inPublicOpenApi: boolean;
  owningFeature: string;
  /** Who calls it. "none (unconsumed)" is a real and important answer. */
  consumer: string;
  /** Required whenever a public route is NOT in the document, or a shape needs a caveat. */
  note?: string;
}

/** Keyed by path relative to `src/routes/api/`, forward slashes, with the .ts extension. */
export const ROUTE_CLASSIFICATIONS: Readonly<Record<string, RouteClassificationEntry>> = {
  // ── Public content reads ──────────────────────────────────────────────────────────────────
  "v1/(public)/blog/index.ts": {
    path: "/api/v1/blog",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "blog",
    consumer: "landing blog list",
  },
  "v1/(public)/blog/$slug.ts": {
    path: "/api/v1/blog/{slug}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "blog",
    consumer: "landing blog detail",
  },
  "v1/(public)/blog/categories.ts": {
    path: "/api/v1/blog/categories",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "blog",
    consumer: "landing blog list filter",
  },
  "v1/(public)/community/categories/index.ts": {
    path: "/api/v1/community/categories",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing community filter chips",
  },
  "v1/(public)/community/questions/$slug.ts": {
    path: "/api/v1/community/questions/{slug}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing question detail",
  },
  "v1/(public)/community/reviews/$slug.ts": {
    path: "/api/v1/community/reviews/{slug}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing review detail",
  },
  "v1/(public)/contact-locations/index.ts": {
    path: "/api/v1/contact-locations",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing global shell footer",
  },
  "v1/(public)/faqs/index.ts": {
    path: "/api/v1/faqs",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing home + service FAQ sections",
  },
  "v1/(public)/homepage/index.ts": {
    path: "/api/v1/homepage",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "homepage",
    consumer: "landing homepage",
  },
  "v1/(public)/integrations/index.ts": {
    path: "/api/v1/integrations",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing homepage integrations strip",
  },
  "v1/(public)/jobs/index.ts": {
    path: "/api/v1/jobs",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "careers",
    consumer: "landing careers list",
  },
  "v1/(public)/jobs/$slug.ts": {
    path: "/api/v1/jobs/{slug}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "careers",
    consumer: "landing job detail",
  },
  "v1/(public)/marquee-images/index.ts": {
    path: "/api/v1/marquee-images",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing homepage marquee",
  },
  "v1/(public)/policies/index.ts": {
    path: "/api/v1/policies",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "policies",
    consumer: "landing /policy",
  },
  "v1/(public)/policies/$slug.ts": {
    path: "/api/v1/policies/{slug}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "policies",
    consumer: "landing /policy",
  },
  "v1/(public)/pricing/index.ts": {
    path: "/api/v1/pricing",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "pricing",
    consumer: "landing pricing routes",
  },
  "v1/(public)/pricing/$slug.ts": {
    path: "/api/v1/pricing/{slug}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "pricing",
    consumer: "landing pricing routes",
  },
  "v1/(public)/service-blocks/index.ts": {
    path: "/api/v1/service-blocks",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing THG Order + Next THG Fulfill",
  },
  "v1/(public)/services/index.ts": {
    path: "/api/v1/services",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing service routes",
  },
  "v1/(public)/shipping-routes/index.ts": {
    path: "/api/v1/shipping-routes",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "shipping",
    consumer: "landing /shipping-policy",
  },
  "v1/(public)/shipping-routes/$slug.ts": {
    path: "/api/v1/shipping-routes/{slug}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "shipping",
    consumer: "landing /shipping-policy",
  },
  "v1/(public)/site-settings/index.ts": {
    path: "/api/v1/site-settings",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "settings",
    consumer: "landing global shell (brand, contact, analytics ids)",
    note:
      "CONTRACT CONCERN — `lead_form_destination` is operator configuration (an admin-set URL, " +
      "settings.actions.ts validates it as z.string().url()) published on an unauthenticated " +
      "endpoint, and NO landing code reads it in either app. It predates the contract freeze " +
      "and removing it is a wire-shape change that also touches the landing's cmsSchemas.ts and " +
      "cms-generated.d.ts, so it needs the deprecation policy and an owner decision rather than " +
      "a quiet edit here. Pinned by a dedicated test so it cannot be removed accidentally or " +
      "joined by another config field. See the PR description.",
  },
  "v1/(public)/sitemap/index.ts": {
    path: "/api/v1/sitemap",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing sitemap generation (build-time), not a browser",
    note:
      "Returns only status='live' rows, so it publishes nothing a crawler could not already " +
      "reach. Build-time-only consumption does not make it internal: it is unauthenticated and " +
      "CORS-enabled, so it is public in fact and is contracted as such.",
  },
  "v1/(public)/testimonials/index.ts": {
    path: "/api/v1/testimonials",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "content",
    consumer: "landing homepage testimonials",
  },
  "v1/(public)/translations/index.ts": {
    path: "/api/v1/translations",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "i18n",
    consumer: "landing marketing-copy overlay",
  },
  "v1/(public)/community/questions/index.ts": {
    path: "/api/v1/community/questions",
    methods: ["get", "post"],
    classification: "PUBLIC_WRITE_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing community list + ask dialog",
    note: "GET is a content read; POST is the moderated submission. Classified by the stronger of the two.",
  },
  "v1/(public)/community/reviews/index.ts": {
    path: "/api/v1/community/reviews",
    methods: ["get", "post"],
    classification: "PUBLIC_WRITE_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing reviews list + submit dialog",
  },

  // ── Public writes ─────────────────────────────────────────────────────────────────────────
  "v1/(public)/leads/index.ts": {
    path: "/api/v1/leads",
    methods: ["post"],
    classification: "PUBLIC_WRITE_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "leads",
    consumer: "landing lead dialog, homepage form, every service form",
    note: "Turnstile + 10/IP/hour. The single canonical lead endpoint.",
  },
  "v1/(public)/applicants/index.ts": {
    path: "/api/v1/applicants",
    methods: ["post"],
    classification: "PUBLIC_WRITE_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "careers",
    consumer: "landing job application dialog",
    note: "Turnstile + 5/IP/hour.",
  },
  "v1/(public)/applicant-cv/index.ts": {
    path: "/api/v1/applicant-cv",
    methods: ["post"],
    classification: "PUBLIC_WRITE_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "careers",
    consumer: "landing job application dialog",
    note:
      "SECURITY CONCERN — unauthenticated R2 write with NO Turnstile; the only control is " +
      "5/IP/hour plus MIME and 10MB caps. Every sibling public write verifies Turnstile. " +
      "Adding it changes the request contract and needs a coordinated landing change, so it is " +
      "reported rather than done here. Behavior is unchanged by the contract freeze.",
  },
  "v1/(public)/community/questions/$slug.same-issue.ts": {
    path: "/api/v1/community/questions/{slug}/same-issue",
    methods: ["post"],
    classification: "PUBLIC_WRITE_API",
    auth: "none",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing question detail reaction",
    note: "No Turnstile by design (one-click UX); hashed IP is the dedupe identity, 30/IP/hour.",
  },
  "v1/(public)/community/questions/$slug.withdraw.ts": {
    path: "/api/v1/community/questions/{slug}/withdraw",
    methods: ["post"],
    classification: "PUBLIC_WRITE_API",
    auth: "owner-token",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing withdraw button",
    note: "Owner token is authorization without an account; a wrong token gets the generic 404.",
  },
  "v1/(public)/community/reviews/$slug.withdraw.ts": {
    path: "/api/v1/community/reviews/{slug}/withdraw",
    methods: ["post"],
    classification: "PUBLIC_WRITE_API",
    auth: "owner-token",
    inPublicOpenApi: true,
    owningFeature: "community",
    consumer: "landing withdraw button",
    note: "Same owner-token contract and generic-404 policy as the question withdraw route.",
  },

  // ── Public, but not typed JSON ────────────────────────────────────────────────────────────
  "v1/(public)/media/$.ts": {
    path: "/api/v1/media/{splat}",
    methods: ["get"],
    classification: "PUBLIC_CONTENT_API",
    auth: "none",
    inPublicOpenApi: false,
    owningFeature: "media",
    consumer: "landing <img> tags; applicant CV links",
    note:
      "Not in the document because it returns image/document BYTES over an unbounded splat key " +
      "— there is no response schema to type, and consumers use it as a URL. " +
      "PRIVACY CONCERN: the same proxy also serves `applicants/<random>-<name>.<ext>` CV " +
      "uploads, so applicant PII is protected only by key unguessability (the handler's own " +
      "comment says so). Pre-existing; flagged, not changed.",
  },
  "v1/(public)/openapi/index.ts": {
    path: "/api/v1/openapi",
    methods: ["get"],
    classification: "HEALTH_OR_DIAGNOSTIC",
    auth: "none",
    inPublicOpenApi: false,
    owningFeature: "openapi",
    consumer: "landing type codegen; API consumers",
    note:
      "Serves the document itself; declaring it inside itself is circular. It exposes only the " +
      "public surface — the registry never receives an admin or auth route.",
  },

  // ── Not public ────────────────────────────────────────────────────────────────────────────
  "v1/(admin)/media/upload.ts": {
    path: "/api/v1/media/upload",
    methods: ["post"],
    classification: "AUTHENTICATED_ADMIN_API",
    auth: "session",
    inPublicOpenApi: false,
    owningFeature: "media",
    consumer: "CMS admin Media Library (same-origin, no CORS)",
    note: "requireSession('editor'). Must never enter the public document.",
  },
  "auth/google/start.ts": {
    path: "/api/auth/google/start",
    methods: ["get"],
    classification: "AUTH_CALLBACK",
    auth: "none",
    inPublicOpenApi: false,
    owningFeature: "auth",
    consumer: "CMS admin login redirect",
    note: "Begins the OAuth flow and sets state/redirect cookies. Rate limited 10/60s per IP.",
  },
  "auth/google/callback.ts": {
    path: "/api/auth/google/callback",
    methods: ["get"],
    classification: "AUTH_CALLBACK",
    auth: "none",
    inPublicOpenApi: false,
    owningFeature: "auth",
    consumer: "Google OAuth redirect",
    note: "Exchanges the code and issues the session cookie. Never a documented API.",
  },
};

/** Classifications whose routes MUST appear in the public OpenAPI document. */
export const PUBLIC_CLASSIFICATIONS: readonly RouteClassification[] = [
  "PUBLIC_CONTENT_API",
  "PUBLIC_WRITE_API",
];

export function isPublicClassification(c: RouteClassification): boolean {
  return PUBLIC_CLASSIFICATIONS.includes(c);
}
