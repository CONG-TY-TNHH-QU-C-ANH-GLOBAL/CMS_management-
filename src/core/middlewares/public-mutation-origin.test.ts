// CMS-P1 wiring proof: every public browser mutation rejects a disallowed Origin BEFORE any
// side effect, and still reaches its existing controls for an allowed one.
//
// WHY THIS ASSERTS COLLABORATORS, NOT STATUS. A 403 proves nothing on its own — a handler could
// write the row and then return 403. Each rejection case below asserts that the rate limiter,
// the store functions and the Telegram dispatcher were never invoked, which is the property the
// boundary actually has to hold. `withMutationOriginBoundary` wraps the handler, so a refused
// origin means the handler body never executes at all.
//
// Mocks are registered before the route modules are pulled in, and the routes are loaded with
// dynamic `await import()` — the same shape src/openapi/public-surface.test.ts uses, because a
// static import would be hoisted above the mock registration.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

const ALLOWED_ORIGIN = "https://thgfulfill.com";
const PREVIEW_ORIGIN = "https://thg-landing-git-migration-next-main-thg.vercel.app";
const HOSTILE_ORIGIN = "https://thgfulfill.com.evil.example";

// ── Side-effect collaborators, all spied ────────────────────────────────────

const spies = {
  rateLimit: mock(async () => ({ allowed: true, remaining: 9, resetAt: 0 })),
  verifyTurnstile: mock(async () => true),
  createLead: mock(async () => ({ id: 1 })),
  createApplicant: mock(async () => ({ id: 1 })),
  getCareersJob: mock(async () => ({ status: "open", title: "x", deadline: null })),
  addSameIssueReaction: mock(async () => ({ same_issue_count: 1, deduped: false })),
  createCommunityQuestion: mock(async () => ({ id: 1, slug: "s", ownerToken: "t" })),
  createCommunityReview: mock(async () => ({ id: 1, slug: "s", ownerToken: "t" })),
  withdrawCommunityQuestion: mock(async () => true),
  withdrawCommunityReview: mock(async () => true),
  dispatchEvent: mock(async () => 1),
  mediaPut: mock(async () => undefined),
};

/** Every collaborator whose invocation would mean a mutation, a notification, or rate-limit
 *  budget was consumed. A rejected request must touch none of them. */
const SIDE_EFFECTS = Object.entries(spies);

mock.module("cloudflare:workers", () => ({
  env: {
    CORS_ORIGIN: "https://thgfulfill.com,https://www.thgfulfill.com",
    BASE_URL: "https://cms.thgfulfill.com",
    MEDIA: { put: spies.mediaPut },
  },
}));

// `mock.module` replaces a module for the WHOLE test process, not just this file. Replacing a
// feature module wholesale therefore breaks unrelated suites that import its pure helpers — an
// earlier revision of this file did exactly that and silently defeated the community privacy
// boundary test. Each mock below keeps every real export and overrides ONLY the collaborators
// whose invocation would be a side effect, so no other suite observes a different module.
// The real modules are pulled in with dynamic import so they load AFTER the `cloudflare:workers`
// stub above (a static import would be hoisted above it).
const [actualRateLimit, actualLeads, actualCareers, actualCommunity, actualTelegram] =
  await Promise.all([
    import("@/core/middlewares/rate-limit"),
    import("@/features/leads"),
    import("@/features/careers"),
    import("@/features/community"),
    import("@/features/telegram"),
  ]);

mock.module("@/core/middlewares/rate-limit", () => ({
  ...actualRateLimit,
  // Real getClientIp is kept — the requests below carry a cf-connecting-ip header.
  rateLimit: spies.rateLimit,
  verifyTurnstile: spies.verifyTurnstile,
}));

mock.module("@/features/leads", () => ({ ...actualLeads, createLead: spies.createLead }));

mock.module("@/features/careers", () => ({
  ...actualCareers,
  createApplicant: spies.createApplicant,
  getCareersJob: spies.getCareersJob,
}));

mock.module("@/features/community", () => ({
  ...actualCommunity,
  addSameIssueReaction: spies.addSameIssueReaction,
  createCommunityQuestion: spies.createCommunityQuestion,
  createCommunityReview: spies.createCommunityReview,
  withdrawCommunityQuestion: spies.withdrawCommunityQuestion,
  withdrawCommunityReview: spies.withdrawCommunityReview,
}));

mock.module("@/features/telegram", () => ({
  ...actualTelegram,
  dispatchEvent: spies.dispatchEvent,
}));

// ── Route table ─────────────────────────────────────────────────────────────

const PUBLIC_DIR = join(import.meta.dir, "..", "..", "routes", "api", "v1", "(public)");

interface RouteCase {
  name: string;
  file: string;
  /** A request body VALID against the route's real request schema, so an allowed origin runs the
   *  handler all the way to its mutation instead of stopping at a 400 that would prove nothing. */
  body?: unknown;
  /** Send the body as multipart/form-data (applicant-cv takes no JSON). */
  formData?: () => FormData;
  params?: Record<string, string>;
  /** The collaborator whose invocation proves the whole downstream chain ran for an allowed
   *  origin — rate limit, schema, Turnstile/owner-token, then the store write. */
  reaches: keyof typeof spies;
}

// Bodies below are checked against the real schemas, not invented:
//   leads              → features/leads/lead-request.ts leadRequestBaseSchema (name, email required)
//   community submits  → community.schemas.ts (title ≥8, body ≥20, *_name, *_email, turnstile_token)
//   community withdraw → community.schemas.ts communityWithdrawRequestSchema = { ownerToken }
//                        camelCase is the FROZEN request contract here — the CMS returns
//                        `owner_token` but CONSUMES `ownerToken`, and the landing client sends
//                        exactly that. Do not "correct" it to snake_case.
//   applicants         → careers.schemas.ts applicantRequestSchema (`name`, not `full_name`;
//                        `locale` is REQUIRED)
//   applicant-cv       → no Zod schema: multipart/form-data with a single `file` field.
const ROUTES: RouteCase[] = [
  {
    name: "POST /leads",
    file: "leads/index.ts",
    body: { name: "a", email: "a@b.co", source_page: "/vi", locale: "vi", turnstile_token: "t" },
    reaches: "createLead",
  },
  {
    name: "POST /community/questions",
    file: "community/questions/index.ts",
    body: {
      title: "Tiêu đề hợp lệ",
      body: "Nội dung đủ dài để qua ràng buộc tối thiểu.",
      author_name: "a",
      author_email: "a@b.co",
      locale: "vi",
      turnstile_token: "t",
    },
    reaches: "createCommunityQuestion",
  },
  {
    name: "POST /community/reviews",
    file: "community/reviews/index.ts",
    body: {
      title: "Tiêu đề hợp lệ",
      body: "Nội dung đủ dài để qua ràng buộc tối thiểu.",
      reviewer_name: "a",
      reviewer_email: "a@b.co",
      rating: 5,
      locale: "vi",
      turnstile_token: "t",
    },
    reaches: "createCommunityReview",
  },
  {
    name: "POST /community/questions/{slug}/same-issue",
    file: "community/questions/$slug.same-issue.ts",
    params: { slug: "q" },
    reaches: "addSameIssueReaction",
  },
  {
    name: "POST /community/questions/{slug}/withdraw",
    file: "community/questions/$slug.withdraw.ts",
    body: { ownerToken: "t" },
    params: { slug: "q" },
    reaches: "withdrawCommunityQuestion",
  },
  {
    name: "POST /community/reviews/{slug}/withdraw",
    file: "community/reviews/$slug.withdraw.ts",
    body: { ownerToken: "t" },
    params: { slug: "r" },
    reaches: "withdrawCommunityReview",
  },
  {
    name: "POST /applicants",
    file: "applicants/index.ts",
    body: {
      job_slug: "j",
      name: "a",
      email: "a@b.co",
      phone: "0900000000",
      locale: "vi",
      turnstile_token: "t",
    },
    reaches: "createApplicant",
  },
  {
    name: "POST /applicant-cv",
    file: "applicant-cv/index.ts",
    formData: () => {
      const form = new FormData();
      const pdf = new File([new Uint8Array([37, 80, 68, 70])], "cv.pdf", {
        type: "application/pdf",
      });
      form.set("file", pdf);
      return form;
    },
    reaches: "mediaPut",
  },
];

type Handler = (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>;

async function postHandlerOf(file: string): Promise<Handler> {
  const module = (await import(join(PUBLIC_DIR, file))) as {
    Route: { options: { server: { handlers: Record<string, Handler> } } };
  };
  return module.Route.options.server.handlers.POST;
}

function requestFor(route: RouteCase, origin: string | null): Request {
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.7" });
  if (origin !== null) headers.set("origin", origin);
  // multipart sets its own content-type (with the boundary); never set it by hand.
  if (route.body !== undefined) headers.set("content-type", "application/json");
  const body = route.formData
    ? route.formData()
    : route.body === undefined
      ? undefined
      : JSON.stringify(route.body);
  return new Request("https://cms.thgfulfill.com/api/v1/x", { method: "POST", headers, body });
}

function expectNoSideEffects(label: string): void {
  for (const [name, spy] of SIDE_EFFECTS) {
    expect(spy.mock.calls.length, `${label}: ${name} must not be called`).toBe(0);
  }
}

beforeEach(() => {
  for (const [, spy] of SIDE_EFFECTS) spy.mockClear();
});

afterEach(() => {
  for (const [, spy] of SIDE_EFFECTS) spy.mockClear();
});

// ── Rejection: no side effect may occur ─────────────────────────────────────

describe.each([
  ["a representative Vercel Preview origin", PREVIEW_ORIGIN],
  ["a hostile lookalike origin", HOSTILE_ORIGIN],
  ["an arbitrary third-party origin", "https://evil.example"],
  ["the right host on an unexpected port", "https://thgfulfill.com:8443"],
  ["a malformed origin", "not-a-url"],
  ["an opaque origin", "null"],
])("disallowed: %s", (_label, origin) => {
  test.each(ROUTES.map((r) => [r.name, r] as const))(
    "%s → 403 and no mutation, notification or rate-limit accounting",
    async (_name, route) => {
      const handler = await postHandlerOf(route.file);
      const response = await handler({ request: requestFor(route, origin), params: route.params });

      expect(response.status).toBe(403);
      expectNoSideEffects(`${route.name} from ${origin}`);
    },
  );
});

describe("disallowed: a missing Origin header", () => {
  test.each(ROUTES.map((r) => [r.name, r] as const))(
    "%s → 403 and no mutation, notification or rate-limit accounting",
    async (_name, route) => {
      const handler = await postHandlerOf(route.file);
      const response = await handler({ request: requestFor(route, null), params: route.params });

      expect(response.status).toBe(403);
      expectNoSideEffects(`${route.name} without Origin`);
    },
  );
});

// ── Passage: the allowed origin still reaches the existing controls ─────────

describe("allowed: the configured production landing origin", () => {
  test.each(ROUTES.map((r) => [r.name, r] as const))(
    "%s passes the boundary and completes its real downstream chain",
    async (_name, route) => {
      const handler = await postHandlerOf(route.file);
      const response = await handler({
        request: requestFor(route, ALLOWED_ORIGIN),
        params: route.params,
      });

      expect(response.status).not.toBe(403);
      // The first downstream control ran…
      expect(spies.rateLimit.mock.calls.length).toBeGreaterThan(0);
      // …and so did the last one. Reaching the store write means the fixture satisfied the real
      // request schema and the real Turnstile / owner-token step — a 400 from a mistyped fixture
      // would also be "not 403" and would have proved nothing about the allowed path.
      expect(
        spies[route.reaches].mock.calls.length,
        `${route.name}: expected ${route.reaches} to be reached (status ${response.status})`,
      ).toBeGreaterThan(0);
    },
  );
});

// ── The refusal itself stays a well-formed public response ──────────────────

describe("refusal shape", () => {
  test("carries CORS headers, no-store, and the bounded { error } envelope", async () => {
    const handler = await postHandlerOf("leads/index.ts");
    const response = await handler({ request: requestFor(ROUTES[0], PREVIEW_ORIGIN) });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["error"]);
    expect(typeof body.error).toBe("string");
  });

  test("never echoes the rejected origin back", async () => {
    const handler = await postHandlerOf("leads/index.ts");
    const response = await handler({ request: requestFor(ROUTES[0], PREVIEW_ORIGIN) });

    expect(response.headers.get("access-control-allow-origin")).not.toBe(PREVIEW_ORIGIN);
  });
});
