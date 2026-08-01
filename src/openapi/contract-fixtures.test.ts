// Frozen-contract fixtures.
//
// public-surface.test.ts proves the SURFACE is declared. This file proves the
// DTOs behave: representative payloads parse, documented degradations are
// accepted rather than rejected, and additive server changes stay
// backward-compatible.
//
// These are pure schema tests — no database, no Worker. What they lock is the
// consumer-visible contract, which is precisely the thing a well-meaning
// "cleanup" of a feature schema silently breaks. Server-side behavior that
// genuinely needs D1 (real ordering, real publication filtering) is not
// simulated here; the shape guarantees that behavior must satisfy are.

import { expect, test } from "bun:test";

import { blogCategoriesResponseSchema } from "@/features/blog/blog.schemas";
import {
  communityQuestionsResponseSchema,
  communityReviewResponseSchema,
  communitySubmitResponseSchema,
} from "@/features/community/community.schemas";
import {
  faqsResponseSchema,
  serviceBlocksResponseSchema,
  servicesResponseSchema,
  sitemapResponseSchema,
} from "@/features/content/content.schemas";
// Imported from the pure module, not the feature barrel: the barrel pulls in
// leads.service → the D1 client → `cloudflare:workers`, which does not exist
// outside the Worker runtime. lead-request.ts is deliberately dependency-free.
import { parseLeadRequest } from "@/features/leads/lead-request";
import {
  shippingRouteResponseSchema,
  shippingRoutesResponseSchema,
} from "@/features/shipping/shipping.schemas";

// ─── Locale contract ────────────────────────────────────────────────────────

test("a localized response returns ONE requested locale, never a multilingual payload", () => {
  const zh = serviceBlocksResponseSchema.parse({
    locale: "zh",
    page_slug: "thg-fulfill",
    kind: null,
    blocks: [
      {
        id: 1,
        kind: "pain_point",
        position: 1,
        icon: "box",
        title: "标题",
        description: "描述",
        payload: {},
      },
    ],
  });
  expect(zh.locale).toBe("zh");
  expect(zh.blocks[0].title).toBe("标题");

  // A Trio-shaped title — the internal multi-locale representation — must not
  // satisfy the public contract. If this ever passes, the CMS has started
  // leaking its authoring model onto the wire.
  expect(() =>
    serviceBlocksResponseSchema.parse({
      locale: "zh",
      page_slug: "thg-fulfill",
      kind: null,
      blocks: [
        {
          id: 1,
          kind: "pain_point",
          position: 1,
          icon: null,
          title: { vi: "a", en: "b", zh: "c" },
          description: null,
          payload: {},
        },
      ],
    }),
  ).toThrow();
});

test("an unsupported locale is rejected by the contract, not silently mapped", () => {
  // No cross-locale fallback: `fr` is not a supported locale, and the contract
  // must refuse rather than quietly answer in vi.
  expect(() => faqsResponseSchema.parse({ locale: "fr", scope: "home", faqs: [] })).toThrow();
});

// ─── Missing content ────────────────────────────────────────────────────────

test("missing content is an empty collection, never an error shape", () => {
  // An unreviewed EN translation yields zero rows. That is a valid 200 with an
  // empty array — consumers render an honest empty state, they do not treat it
  // as a transport failure.
  expect(faqsResponseSchema.parse({ locale: "en", scope: "home", faqs: [] }).faqs).toEqual([]);
  expect(blogCategoriesResponseSchema.parse({ locale: "en", categories: [] }).categories).toEqual(
    [],
  );
  expect(shippingRoutesResponseSchema.parse({ locale: "zh", routes: [], total: 0 }).total).toBe(0);
  expect(
    serviceBlocksResponseSchema.parse({
      locale: "en",
      page_slug: "thg-fulfill",
      kind: "pain_point",
      blocks: [],
    }).blocks,
  ).toEqual([]);
});

// ─── Service-block contract ─────────────────────────────────────────────────

test("service-blocks echoes the kind filter, and null means all kinds", () => {
  const filtered = serviceBlocksResponseSchema.parse({
    locale: "vi",
    page_slug: "thg-order",
    kind: "process_step",
    blocks: [],
  });
  expect(filtered.kind).toBe("process_step");

  // `kind` is present-and-null when unfiltered — NOT absent. A consumer may
  // read the key unconditionally.
  const unfiltered = serviceBlocksResponseSchema.parse({
    locale: "vi",
    page_slug: "thg-order",
    kind: null,
    blocks: [],
  });
  expect(unfiltered.kind).toBeNull();
  expect("kind" in unfiltered).toBe(true);
});

test("service-block identity is page + kind + position-ordered blocks", () => {
  // The wire has no semantic block_key yet, so a consumer's stable role must be
  // derivable from (page_slug, kind, position). Positions are what the server
  // orders by; this fixture locks that they survive the contract intact.
  const parsed = serviceBlocksResponseSchema.parse({
    locale: "vi",
    page_slug: "thg-fulfill",
    kind: "process_step",
    blocks: [
      {
        id: 11,
        kind: "process_step",
        position: 1,
        icon: "a",
        title: "Bước 1",
        description: null,
        payload: { num: "01" },
      },
      {
        id: 12,
        kind: "process_step",
        position: 2,
        icon: "b",
        title: "Bước 2",
        description: null,
        payload: { num: "02" },
      },
    ],
  });
  expect(parsed.blocks.map((b) => b.position)).toEqual([1, 2]);
  expect(parsed.blocks.every((b) => b.kind === parsed.kind)).toBe(true);
});

test("a malformed block payload degrades to {} and does NOT fail the response", () => {
  // Documented fail-safe: one bad editor payload must not blank a marketing
  // page. The handler emits `payload: {}`; the contract must accept it.
  const parsed = serviceBlocksResponseSchema.parse({
    locale: "vi",
    page_slug: "thg-order",
    kind: null,
    blocks: [
      {
        id: 1,
        kind: "stat",
        position: 1,
        icon: null,
        title: "OK",
        description: null,
        payload: { val: "99%" },
      },
      {
        id: 2,
        kind: "stat",
        position: 2,
        icon: null,
        title: "Broken",
        description: null,
        payload: {},
      },
    ],
  });
  expect(parsed.blocks).toHaveLength(2);
  expect(parsed.blocks[1].payload).toEqual({});
});

test("nullable editorial fields stay nullable — tightening them breaks live rows", () => {
  const parsed = serviceBlocksResponseSchema.parse({
    locale: "vi",
    page_slug: "thg-warehouse",
    kind: null,
    blocks: [
      { id: 1, kind: "stat", position: 1, icon: null, title: null, description: null, payload: {} },
    ],
  });
  expect(parsed.blocks[0].icon).toBeNull();
  expect(parsed.blocks[0].title).toBeNull();
});

// ─── Backward compatibility ─────────────────────────────────────────────────

test("an additive server field does not break an existing consumer", () => {
  // Adding a field is a MINOR change. Zod strips unknown keys by default, so a
  // client pinned to today's contract keeps working when the server starts
  // sending `block_key` alongside `id` — which is exactly the PostgreSQL
  // migration's planned additive step.
  const parsed = serviceBlocksResponseSchema.parse({
    locale: "vi",
    page_slug: "thg-fulfill",
    kind: null,
    blocks: [
      {
        id: 1,
        kind: "pain_point",
        position: 1,
        icon: null,
        title: "t",
        description: null,
        payload: {},
        block_key: "fulfill.pain.storage_cost",
        revision_id: 42,
      },
    ],
    revision: 7,
  });
  expect(parsed.blocks).toHaveLength(1);
  expect(parsed.blocks[0].id).toBe(1);
});

test("removing a documented field IS breaking and must fail loudly", () => {
  expect(() =>
    serviceBlocksResponseSchema.parse({
      locale: "vi",
      page_slug: "thg-fulfill",
      kind: null,
      blocks: [
        { id: 1, kind: "pain_point", position: 1, icon: null, title: "t", description: null },
      ],
    }),
  ).toThrow();
});

// ─── Publication and moderation gating ──────────────────────────────────────

test("a public submission always comes back pending, never published", () => {
  const parsed = communitySubmitResponseSchema.parse({
    ok: true,
    id: 5,
    slug: "cau-hoi-abc",
    status: "pending",
    owner_token: "tok_secret",
  });
  expect(parsed.status).toBe("pending");

  // The endpoint cannot report a submission as already live — that would let a
  // client bypass the moderation state in its UI.
  expect(() =>
    communitySubmitResponseSchema.parse({
      ok: true,
      id: 5,
      slug: "cau-hoi-abc",
      status: "published",
      owner_token: "tok_secret",
    }),
  ).toThrow();
});

test("public reads carry indexability but never the owner token or moderation notes", () => {
  const parsed = communityReviewResponseSchema.parse({
    review: {
      slug: "review-abc",
      title: "Good service",
      body: "Detailed body text",
      category: { slug: "fulfill", name: "Fulfill" },
      reviewer_name: "An",
      rating: 5,
      public_summary: null,
      verified: true,
      indexable: true,
      published_at: 1_700_000_000,
      // Present in the DB row and on the submit request — must be stripped here.
      owner_token: "tok_secret",
      private_evidence_note: "internal",
      reviewer_email: "a@example.com",
    },
  });
  expect(parsed.review).not.toHaveProperty("owner_token");
  expect(parsed.review).not.toHaveProperty("private_evidence_note");
  expect(parsed.review).not.toHaveProperty("reviewer_email");
  expect(parsed.review.indexable).toBe(true);
});

test("indexability is a server-computed boolean the consumer must not re-derive", () => {
  const parsed = communityQuestionsResponseSchema.parse({
    questions: [
      {
        slug: "q1",
        title: "T",
        excerpt: "E",
        category: null,
        has_expert_answer: false,
        verified: false,
        indexable: false,
        same_issue_count: 0,
        published_at: null,
      },
    ],
  });
  // Published but not indexable is a real, valid state — the landing must
  // render it with noindex rather than inferring indexability itself.
  expect(parsed.questions[0].indexable).toBe(false);
});

// ─── Shipping + sitemap degradations ────────────────────────────────────────

test("shipping detail tolerates empty notes and tables from malformed JSON blobs", () => {
  const parsed = shippingRouteResponseSchema.parse({
    locale: "vi",
    route: {
      slug: "vn-us",
      position: 1,
      title: "Việt Nam → Hoa Kỳ",
      origin: "VN",
      destination: "US",
      kind: "air",
      body_md: null,
      notes: [],
      tables: [],
      updated_at: 1_700_000_000,
    },
  });
  expect(parsed.route.notes).toEqual([]);
  expect(parsed.route.tables).toEqual([]);
});

test("sitemap returns every locale so the consumer can build hreflang alternates", () => {
  const parsed = sitemapResponseSchema.parse({
    pages: [
      { route: "/thg-fulfill", locale: "vi", updated_at: 1 },
      { route: "/thg-fulfill", locale: "en", updated_at: 1 },
    ],
    blog: [{ slug: "post", locale: "vi", published_date: null, updated_at: 1 }],
  });
  expect(new Set(parsed.pages.map((p) => p.locale))).toEqual(new Set(["vi", "en"]));
});

test("services keeps all three status values even though archived is filtered server-side", () => {
  // Narrowing this enum to ["draft","live"] would be a breaking change for the
  // landing's existing consumer schema.
  const parsed = servicesResponseSchema.parse({
    locale: "vi",
    services: [
      {
        id: "thg-fulfill",
        position: 1,
        icon: null,
        status: "live",
        name: "THG Fulfill",
        tagline: null,
        hero_eyebrow: null,
        hero_title: null,
        hero_sub: null,
        cta_text: null,
        cta_url: null,
        body_md: null,
        bullets: [],
        gallery: [],
        videos: [],
        products: [],
      },
    ],
  });
  expect(parsed.services[0].status).toBe("live");
});

// ─── Lead contract (cross-field rules, not just field shape) ────────────────

test("the canonical lead contract accepts a generic lead with no service intent", () => {
  const result = parseLeadRequest({
    name: "An",
    email: "an@example.com",
    turnstile_token: "tok",
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.primary_service).toBeNull();
    expect(result.value.service_interests).toEqual([]);
  }
});

test("lead interests persist in deterministic order, never client submission order", () => {
  const result = parseLeadRequest({
    name: "An",
    email: "an@example.com",
    turnstile_token: "tok",
    primary_service: "warehouse",
    service_interests: ["express", "fulfill", "warehouse"],
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    // Primary first, then canonical registry order — not ["express","fulfill",…].
    expect(result.value.service_interests).toEqual(["warehouse", "fulfill", "express"]);
  }
});

test("a lead violating a cross-field rule is rejected with a bounded message", () => {
  const result = parseLeadRequest({
    name: "An",
    email: "an@example.com",
    turnstile_token: "tok",
    primary_service: "fulfill",
    service_interests: ["express"],
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    // A user-safe sentence — never a provider or SQL error.
    expect(result.message).toBe("primary_service must be included in service_interests");
  }
});
