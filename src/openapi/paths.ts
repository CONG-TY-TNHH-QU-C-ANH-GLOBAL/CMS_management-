// OpenAPI path registrations.
//
// Each route under /api/v1/ that has been migrated to OpenAPI (Phase D2.x)
// gets ONE entry here. This file is side-effect-imported by ./generate so
// the registry singleton is populated before generateOpenApiDocument() runs.
//
// Dependency direction (enforced by import discipline):
//   path config (this file)       → @/features/<f>/<f>.schemas (✓)
//   path config (this file)       → ./registry                 (✓)
//   src/routes/api/v1/**/index.ts → @/features/<f>/<f>.service (✓)
//   src/routes/api/v1/**/index.ts → @/openapi/*                (✗ FORBIDDEN)
//
// Runtime route handlers must remain agnostic of OpenAPI generation. They
// keep importing only their feature services, not the registry.
//
// Single source of truth: each `xxxRouteConfig` is exported so the drift
// check script (scripts/check-openapi-drift.ts) can verify the schema in
// the config is `===` to the canonical schema export. This catches the
// "copy-paste schema drift" failure mode where someone redefines a similar
// Zod shape here instead of importing the feature schema.

import { z } from "zod";

import {
  blogCategoriesResponseSchema,
  blogListResponseSchema,
  blogPostResponseSchema,
} from "@/features/blog/blog.schemas";
import {
  applicantCreatedResponseSchema,
  applicantCvUploadedResponseSchema,
  applicantRequestSchema,
  jobResponseSchema,
  jobsResponseSchema,
} from "@/features/careers/careers.schemas";
import {
  communityCategoriesResponseSchema,
  communityQuestionResponseSchema,
  communityQuestionsResponseSchema,
  communityReviewResponseSchema,
  communityReviewsResponseSchema,
  communityQuestionSubmitSchema,
  communityReviewSubmitSchema,
  communitySameIssueResponseSchema,
  communitySubmitResponseSchema,
  communityWithdrawRequestSchema,
  communityWithdrawResponseSchema,
} from "@/features/community/community.schemas";
import {
  contactLocationsResponseSchema,
  faqsResponseSchema,
  integrationsResponseSchema,
  marqueeImagesResponseSchema,
  serviceBlocksResponseSchema,
  servicesResponseSchema,
  sitemapResponseSchema,
  testimonialsResponseSchema,
} from "@/features/content/content.schemas";
import { homepageResponseSchema } from "@/features/homepage/homepage.schemas";
import { translationsResponseSchema } from "@/features/i18n/i18n.schemas";
import { leadRequestBaseSchema } from "@/features/leads/lead-request";
import { leadCreatedResponseSchema } from "@/features/leads/leads.schemas";
import {
  policiesResponseSchema,
  policyResponseSchema,
} from "@/features/policies/policies.schemas";
import {
  pricingResponseSchema,
  pricingTableResponseSchema,
} from "@/features/pricing/pricing.schemas";
import { siteSettingsResponseSchema } from "@/features/settings/settings.schemas";
import {
  shippingRouteResponseSchema,
  shippingRoutesResponseSchema,
} from "@/features/shipping/shipping.schemas";
import { openApiRegistry } from "./registry";

// Reused fragments. Inlined here (not extracted to a shared module) until a
// third call site appears — see D2.1 brief constraint #6: no premature
// abstraction.
const errorBodySchema = z.object({ error: z.string() });

// Mirrors the FAQ route at src/routes/api/v1/(public)/faqs/index.ts.
// Query params reflect the existing handler defaults:
//   - lang defaults to "en" server-side (handler line: lang ?? "en")
//   - scope defaults to "home" server-side (handler line: scope ?? "home")
// Both are .optional() in OpenAPI to document that callers may omit them.
export const faqsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/faqs",
  summary: "List FAQs for a locale and scope",
  description:
    "VI reads from `faqs`; EN/ZH JOINs `faq_translations` filtered to " +
    "`status='reviewed'`. Unreviewed rows are omitted (no cross-locale " +
    "fallback). Landing's static i18n.tsx covers gaps.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
      scope: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "FAQ list",
      content: {
        "application/json": { schema: faqsResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
} as const;

openApiRegistry.registerPath(faqsRouteConfig);

// Mirrors testimonials route at src/routes/api/v1/(public)/testimonials/index.ts.
// Handler validates `lang` via isLocale; rejects with 400 otherwise. The
// handler strips per-row `locale` before responding (the wrapper carries it).
export const testimonialsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/testimonials",
  summary: "List testimonials for a locale",
  description:
    "VI reads from `testimonials`; EN/ZH JOINs `testimonial_translations` " +
    "filtered to `status='reviewed'`. Per-row `locale` is stripped from " +
    "the response item — the wrapper's `locale` field carries it instead.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Testimonial list",
      content: {
        "application/json": { schema: testimonialsResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(testimonialsRouteConfig);

// Mirrors contact-locations route at src/routes/api/v1/(public)/contact-locations/index.ts.
// Handler filters by locale server-side and strips per-row `locale` before
// responding (same pattern as testimonials).
export const contactLocationsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/contact-locations",
  summary: "List contact locations for a locale",
  description:
    "Locations include offices, warehouses, and external channels (phone, " +
    "email, website). Filtered to the requested locale server-side.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Contact locations",
      content: {
        "application/json": { schema: contactLocationsResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(contactLocationsRouteConfig);

// Mirrors integrations route at src/routes/api/v1/(public)/integrations/index.ts.
// Integrations are NOT localized — handler takes no `lang` query and returns
// no `locale` field on the response wrapper.
export const integrationsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/integrations",
  summary: "List logistics / platform integrations",
  description:
    "Returns the marquee/logo list of integration partners shown on " +
    "landing. Sorted by `position`. Not localized.",
  responses: {
    200: {
      description: "Integration list",
      content: {
        "application/json": { schema: integrationsResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(integrationsRouteConfig);

// Mirrors translations route at src/routes/api/v1/(public)/translations/index.ts.
// Unlike the other endpoints in this batch, `lang` is REQUIRED here: the
// handler returns 400 when omitted (handler line 13: `!lang || !isLocale(lang)`).
export const translationsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/translations",
  summary: "Get the i18n dictionary for a locale",
  description:
    "Returns `Record<string, string>` of all reviewed translation keys for " +
    "the locale. `lang` is required — omitting it produces a 400.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]),
    }),
  },
  responses: {
    200: {
      description: "Translation dictionary",
      content: {
        "application/json": { schema: translationsResponseSchema },
      },
    },
    400: {
      description: "Missing or invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(translationsRouteConfig);

// ──── HEIGHTENED-WATCH BATCH (D2.3) ────
// Blog list / detail and marquee images carry the `alt_text` field that
// regressed in incident 11e9230. The Zod schema imports above must be the
// canonical exports from feature/<f>.schemas — the drift check script
// asserts strict object identity to catch copy-paste redefinition here.

// Mirrors blog list route at src/routes/api/v1/(public)/blog/index.ts.
// Returns summary projection — no slides, no seo_* fields.
export const blogListRouteConfig = {
  method: "get" as const,
  path: "/api/v1/blog",
  summary: "List blog posts for a locale",
  description:
    "Status=`live` only (drafts and archived are filtered server-side). " +
    "VI reads from `blog_posts`; EN/ZH JOINs locale-specific rows. " +
    "Optional `category` filter is applied client-side after fetch.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
      category: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Blog post summary list (live posts only)",
      content: {
        "application/json": { schema: blogListResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(blogListRouteConfig);

// Mirrors blog detail route at src/routes/api/v1/(public)/blog/$slug.ts.
// Includes seo_* fields and embedded slides[] from getBlogSlides().
// alt_text in slides[] is heightened-watch — see blog.schemas.ts header.
export const blogPostRouteConfig = {
  method: "get" as const,
  path: "/api/v1/blog/{slug}",
  summary: "Get one blog post by slug for a locale",
  description:
    "Returns post + slides[]. 404 if slug+locale combination not found, " +
    "or if the post status is not `live`. Slide order is preserved from " +
    "the database `position` column.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Blog post detail with slides",
      content: {
        "application/json": { schema: blogPostResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "Post not found or not published",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(blogPostRouteConfig);

// Mirrors marquee-images route at src/routes/api/v1/(public)/marquee-images/index.ts.
// Not localized; no query params. alt_text is heightened-watch — see
// content.schemas.ts header for `marqueeImageItemSchema`.
export const marqueeImagesRouteConfig = {
  method: "get" as const,
  path: "/api/v1/marquee-images",
  summary: "List marquee images shown in the landing logo strip",
  description:
    "Returns the sorted marquee image list. Not localized. `src` is " +
    "resolved server-side via INNER JOIN against the media table.",
  responses: {
    200: {
      description: "Marquee image list",
      content: {
        "application/json": { schema: marqueeImagesResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(marqueeImagesRouteConfig);

// Mirrors jobs list route at src/routes/api/v1/(public)/jobs/index.ts.
// status=open only (server-side filter). Optional `category` query.
export const jobsListRouteConfig = {
  method: "get" as const,
  path: "/api/v1/jobs",
  summary: "List open job postings for a locale",
  description:
    "Status=`open` only (drafts/closed/archived filtered server-side). " +
    "Optional `category` query narrows the list. `hot` is coerced from " +
    "the DB integer column to boolean (handler line: `j.hot === 1`).",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
      category: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Job summary list (open jobs only)",
      content: {
        "application/json": { schema: jobsResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(jobsListRouteConfig);

// Mirrors job detail route at src/routes/api/v1/(public)/jobs/$slug.ts.
// Adds body_md + lead + 4 parsed-JSON fields (responsibilities /
// requirements / benefits / bonuses). The 4 JSON fields are ALWAYS
// present in the wire shape: the handler's `parseJson(...) ?? {}` /
// `?? []` fallback guarantees an empty container even when the
// underlying DB column is null or contains malformed JSON.
export const jobRouteConfig = {
  method: "get" as const,
  path: "/api/v1/jobs/{slug}",
  summary: "Get one job posting by slug for a locale",
  description:
    "Returns the full job detail with parsed JSON-string columns " +
    "materialized into structured fields (responsibilities, requirements, " +
    "benefits, bonuses). 404 if slug+locale not found, or if status≠open.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Job detail with parsed JSON fields",
      content: {
        "application/json": { schema: jobResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "Job not found or not open",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(jobRouteConfig);

// ──────────────────────────────────────────────────────────────────────────
// D2.5 — Services + homepage
// ──────────────────────────────────────────────────────────────────────────

// Mirrors services route at src/routes/api/v1/(public)/services/index.ts.
// Handler filters "archived" status server-side but the response status
// enum keeps all 3 values to match landing's existing consumer contract.
// gallery/products are hydrated via media JOIN so the wire shape may
// include resolved URLs that aren't present in the underlying *_json columns.
export const servicesRouteConfig = {
  method: "get" as const,
  path: "/api/v1/services",
  summary: "List services for a locale (flat per-locale projection)",
  description:
    "Returns each service flattened with i18n applied for the requested " +
    "locale. gallery[] and products[] media_id references are hydrated to " +
    "resolved URLs server-side. Archived services are filtered out.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Service list (draft + live)",
      content: {
        "application/json": { schema: servicesResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(servicesRouteConfig);

// Mirrors homepage route at src/routes/api/v1/(public)/homepage/index.ts.
// VI reads from homepage_blocks; EN/ZH JOINs homepage_block_translations
// filtered by status='reviewed'. payload is always { string: string } —
// safeParse coerces non-string values to "" before sending on the wire.
export const homepageRouteConfig = {
  method: "get" as const,
  path: "/api/v1/homepage",
  summary: "Get homepage blocks for a locale",
  description:
    "Returns the ordered list of homepage blocks (hero, trust, " +
    "services_grid, etc.) with their string-keyed payload maps. EN/ZH " +
    "JOIN homepage_block_translations filtered to status='reviewed'.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Homepage block list",
      content: {
        "application/json": { schema: homepageResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(homepageRouteConfig);

// ──────────────────────────────────────────────────────────────────────────
// D2.6 — Site settings + pricing + policies
// ──────────────────────────────────────────────────────────────────────────

// Mirrors site-settings route at src/routes/api/v1/(public)/site-settings/index.ts.
// Singleton document. Returns `{ settings: null }` if the singleton row
// is missing. NOT localized — settings are global.
export const siteSettingsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/site-settings",
  summary: "Get global site settings (singleton)",
  description:
    "Returns the singleton site-settings document with brand info, " +
    "tracking IDs, contact details, and parsed remote_area_links / " +
    "terminology arrays. `settings` is null when the row is missing.",
  responses: {
    200: {
      description: "Site settings document or null",
      content: {
        "application/json": { schema: siteSettingsResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(siteSettingsRouteConfig);

// Mirrors pricing list route at src/routes/api/v1/(public)/pricing/index.ts.
// Returns categories with their tables. NOT localized — pricing tables
// are language-agnostic; the table data may include locale-sensitive
// labels inside `data_json`/`schema_json` but the wire envelope is not.
export const pricingListRouteConfig = {
  method: "get" as const,
  path: "/api/v1/pricing",
  summary: "List pricing tables grouped by category",
  description:
    "Returns all pricing tables grouped into categories inferred from " +
    "slug. Each entry is a summary (no schema/data blobs) — fetch the " +
    "detail endpoint for full table content.",
  responses: {
    200: {
      description: "Pricing categories + table summaries",
      content: {
        "application/json": { schema: pricingResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(pricingListRouteConfig);

// Mirrors pricing detail route at src/routes/api/v1/(public)/pricing/$slug.ts.
// Parses schema_json and data_json server-side (independently — malformed
// one doesn't poison the other). Final shape `unknown` for both since it
// varies per kind (weight_grid vs meta_kv); consumers narrow downstream.
export const pricingTableRouteConfig = {
  method: "get" as const,
  path: "/api/v1/pricing/{slug}",
  summary: "Get one pricing table by slug",
  description:
    "Returns the full pricing table including parsed schema + data " +
    "blobs. 404 if slug not found. Parse failures on schema_json or " +
    "data_json produce `null` for the affected field rather than the " +
    "whole table — consumers should defend against partial payloads.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Pricing table detail",
      content: {
        "application/json": { schema: pricingTableResponseSchema },
      },
    },
    404: {
      description: "No pricing table with given slug",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(pricingTableRouteConfig);

// Mirrors policies list route at src/routes/api/v1/(public)/policies/index.ts.
export const policiesListRouteConfig = {
  method: "get" as const,
  path: "/api/v1/policies",
  summary: "List policies for a locale",
  description:
    "Returns the ordered list of policy summaries for the given locale. " +
    "Each entry has slug, title, icon, mode (image|text), summary, " +
    "position — no body_md or full content. Fetch the detail endpoint " +
    "for full policy text.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Policy summary list",
      content: {
        "application/json": { schema: policiesResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(policiesListRouteConfig);

// Mirrors policies detail route at src/routes/api/v1/(public)/policies/$slug.ts.
// body_md is NON-NULL (matches PolicyRow.body_md type). image_list and
// text_blocks are parsed-JSON with fallback to [] — always present on
// the wire.
export const policyRouteConfig = {
  method: "get" as const,
  path: "/api/v1/policies/{slug}",
  summary: "Get one policy by slug for a locale",
  description:
    "Returns the full policy including body_md (markdown) and parsed " +
    "image_list + text_blocks arrays. 404 if slug+locale not found.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Policy detail",
      content: {
        "application/json": { schema: policyResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "Policy not found in locale",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(policyRouteConfig);

// ──────────────────────────────────────────────────────────────────────────
// Community Hub MVP (Sprint 1) — public Q&A read endpoints.
// POST endpoints (submit question, same-issue reaction) follow the
// leads/applicants precedent and stay OUT of the OpenAPI contract.
// ──────────────────────────────────────────────────────────────────────────

// Mirrors community questions list at
// src/routes/api/v1/(public)/community/questions/index.ts.
// status='published' only (server-side filter). NOT localized in MVP —
// UGC is served in the language it was written in (VI-canonical repo rule).
export const communityQuestionsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/community/questions",
  summary: "List published community questions",
  description:
    "Published questions only — pending/rejected never leave the CMS. " +
    "`indexable` is computed server-side (published AND verified AND has " +
    "expert answer — see community.policy.ts); landing derives its noindex " +
    "rule from it. Optional `category` filters by category slug.",
  request: {
    query: z.object({
      category: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Published question summary list",
      content: {
        "application/json": { schema: communityQuestionsResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityQuestionsRouteConfig);

// Mirrors community question detail at
// src/routes/api/v1/(public)/community/questions/$slug.ts.
// Privacy: author_email/ip/user_agent/utm_json are admin-only and never
// appear on this wire shape.
export const communityQuestionRouteConfig = {
  method: "get" as const,
  path: "/api/v1/community/questions/{slug}",
  summary: "Get one published community question by slug",
  description:
    "404 unless the question status is `published`. Includes the THG " +
    "expert answer (nullable) and the computed `indexable` flag.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Published question detail",
      content: {
        "application/json": { schema: communityQuestionResponseSchema },
      },
    },
    404: {
      description: "Question not found or not published",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityQuestionRouteConfig);

// Mirrors community categories at
// src/routes/api/v1/(public)/community/categories/index.ts.
// Not localized; sorted by position.
export const communityCategoriesRouteConfig = {
  method: "get" as const,
  path: "/api/v1/community/categories",
  summary: "List community categories",
  description: "Ordered category list used for filtering and the ask-question form.",
  responses: {
    200: {
      description: "Category list",
      content: {
        "application/json": { schema: communityCategoriesResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityCategoriesRouteConfig);

// Mirrors community reviews list at
// src/routes/api/v1/(public)/community/reviews/index.ts.
// Published + verified reviews only; `indexable` is computed server-side
// (published AND verified AND non-thin body — see community.policy.ts).
// Submit / withdraw POSTs stay OUT of the contract, matching the questions
// precedent. NOT localized in MVP — UGC is served as written.
export const communityReviewsRouteConfig = {
  method: "get" as const,
  path: "/api/v1/community/reviews",
  summary: "List published community reviews",
  description:
    "Published reviews only — pending/rejected/withdrawn never leave the CMS. " +
    "`indexable` is computed server-side (published AND verified AND non-thin " +
    "body — see community.policy.ts); landing derives its noindex rule from it. " +
    "Optional `category` filters by category slug.",
  request: {
    query: z.object({
      category: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Published review summary list",
      content: {
        "application/json": { schema: communityReviewsResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityReviewsRouteConfig);

// Mirrors community review detail at
// src/routes/api/v1/(public)/community/reviews/$slug.ts.
// Privacy: reviewer_email/ip/user_agent/utm_json and the private evidence/order
// fields are admin-only and never appear on this wire shape.
export const communityReviewRouteConfig = {
  method: "get" as const,
  path: "/api/v1/community/reviews/{slug}",
  summary: "Get one published community review by slug",
  description:
    "404 unless the review status is `published` and not withdrawn. Includes " +
    "the optional operator `public_summary`, `rating` and the computed " +
    "`indexable` flag.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Published review detail",
      content: {
        "application/json": { schema: communityReviewResponseSchema },
      },
    },
    404: {
      description: "Review not found or not published",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityReviewRouteConfig);

// ══════════════════════════════════════════════════════════════════════════
// Contract freeze v1 — the public endpoints the landing already consumes but
// which were never declared. Nothing below changes a response shape: every
// schema was EXTRACTED from the handler that ships today. The point is to
// make the surface enumerable, so `bun test` can prove no public endpoint
// escapes the contract (src/openapi/public-surface.test.ts).
// ══════════════════════════════════════════════════════════════════════════

// Mirrors src/routes/api/v1/(public)/service-blocks/index.ts.
// This is the generic page-block endpoint behind THG Order and the Next.js
// THG Fulfill route. Identity is `page_slug + kind + <block key>`; the wire
// item currently exposes only the numeric D1 `id`, so consumers deriving a
// stable role do it from `kind + position`.
export const serviceBlocksRouteConfig = {
  method: "get" as const,
  path: "/api/v1/service-blocks",
  summary: "List page blocks for one page and locale",
  description:
    "Returns generic blocks (pain_point, process_step, solution, " +
    "shipping_lane, policy, stat, …) for one `page_slug` + locale, ordered " +
    "by `position`. Omit `kind` to hydrate every section of a page in one " +
    "request; the response echoes the filter as `kind` (null when omitted). " +
    "VI reads `service_blocks`; EN/ZH JOIN `service_block_translations` " +
    "filtered to `status='reviewed'` — no cross-locale fallback. " +
    "FAIL-SAFE: a row whose `payload_json` is malformed is returned with " +
    "`payload: {}` rather than being dropped or failing the request.",
  request: {
    query: z.object({
      page_slug: z.string(),
      lang: z.enum(["en", "vi", "zh"]).optional(),
      kind: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Ordered block list for the page + locale",
      content: {
        "application/json": { schema: serviceBlocksResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang`, or missing required `page_slug`",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(serviceBlocksRouteConfig);

// Mirrors src/routes/api/v1/(public)/blog/categories.ts.
// NOTE the default: `lang` falls back to "vi" here, not "en" as on most other
// endpoints. That asymmetry is pre-existing behavior and is documented rather
// than corrected — changing it would silently move an unqualified caller's
// results to a different locale.
export const blogCategoriesRouteConfig = {
  method: "get" as const,
  path: "/api/v1/blog/categories",
  summary: "List distinct blog categories for a locale",
  description:
    "Distinct non-null `category` values across live posts, sorted by the " +
    "database. `lang` defaults to **vi** on this endpoint. An empty array " +
    "is a valid response, not an error.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Category list",
      content: {
        "application/json": { schema: blogCategoriesResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(blogCategoriesRouteConfig);

// Mirrors src/routes/api/v1/(public)/shipping-routes/index.ts.
export const shippingRoutesListRouteConfig = {
  method: "get" as const,
  path: "/api/v1/shipping-routes",
  summary: "List live shipping routes for a locale",
  description:
    "Unpaginated: returns every `status='live'` route for the locale, " +
    "ordered by (position, slug). `total` is the length of `routes` in the " +
    "same response — it is NOT a pagination total. EN/ZH require a " +
    "`status='reviewed'` translation; there is no cross-locale fallback.",
  request: {
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Live shipping-route summaries",
      content: {
        "application/json": { schema: shippingRoutesResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(shippingRoutesListRouteConfig);

// Mirrors src/routes/api/v1/(public)/shipping-routes/$slug.ts.
export const shippingRouteRouteConfig = {
  method: "get" as const,
  path: "/api/v1/shipping-routes/{slug}",
  summary: "Get one live shipping route by slug",
  description:
    "404 unless the route resolves in the requested locale AND its status " +
    "is `live`. Rate tables are resolved by (slug, locale). FAIL-SAFE: a " +
    "malformed `notes_json` / `columns_json` / `rows_json` blob degrades to " +
    "an empty array instead of failing the request.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    query: z.object({
      lang: z.enum(["en", "vi", "zh"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Shipping route detail with rate tables",
      content: {
        "application/json": { schema: shippingRouteResponseSchema },
      },
    },
    400: {
      description: "Invalid `lang` query parameter",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "No live shipping route with that slug in the locale",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(shippingRouteRouteConfig);

// Mirrors src/routes/api/v1/(public)/sitemap/index.ts.
// Deliberately NOT locale-filtered — the consumer partitions by `locale` to
// build hreflang alternates, so filtering server-side would break that.
export const sitemapRouteConfig = {
  method: "get" as const,
  path: "/api/v1/sitemap",
  summary: "List live page routes and blog slugs for sitemap generation",
  description:
    "Feed for the landing's sitemap builder. Returns every `status='live'` " +
    "row across ALL locales; the consumer groups by `locale`. Takes no " +
    "parameters. `locale` is an unconstrained string here because the " +
    "column carries no CHECK constraint in D1.",
  responses: {
    200: {
      description: "Live routes and blog slugs across every locale",
      content: {
        "application/json": { schema: sitemapResponseSchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(sitemapRouteConfig);

// ─── Write endpoints (conversion + careers funnels) ────────────────────────

// Mirrors src/routes/api/v1/(public)/leads/index.ts.
// THE canonical lead endpoint — there is exactly one, shared by the global
// services dialog, the homepage generic form and every fixed-intent service
// form. Do not add a second, frontend-specific lead API.
export const leadsRouteConfig = {
  method: "post" as const,
  path: "/api/v1/leads",
  summary: "Submit a multi-intent lead",
  description:
    "Multi-intent by design: an optional `primary_service`, zero or more " +
    "`service_interests`, and per-service `service_details`. Cross-field " +
    "rules enforced beyond the field schema: `service_interests` must not " +
    "contain duplicates; `primary_service`, when set, must be a member of " +
    "`service_interests`; each `service_details` key must be a selected " +
    "interest and validates against that service's strict schema. " +
    "Interests are persisted in a deterministic order (primary first, then " +
    "canonical registry order) — never client submission order. " +
    "Protected by Turnstile and a 10-per-IP-per-hour rate limit. " +
    "No provider or database error is ever surfaced; failures use the " +
    "bounded `{ error }` envelope.",
  request: {
    body: {
      content: {
        "application/json": { schema: leadRequestBaseSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Lead accepted and persisted",
      content: {
        "application/json": { schema: leadCreatedResponseSchema },
      },
    },
    400: {
      description: "Malformed JSON, or a field/cross-field validation failure",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    403: {
      description: "Turnstile verification failed",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (10 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(leadsRouteConfig);

// Mirrors src/routes/api/v1/(public)/applicants/index.ts.
// Answers 200 (not 201) on success — pre-existing behavior, kept.
export const applicantsRouteConfig = {
  method: "post" as const,
  path: "/api/v1/applicants",
  summary: "Submit a job application",
  description:
    "Validates that the job exists and is open before accepting. A job " +
    "whose deadline has passed is treated as closed (410) even when its " +
    "status is still `open`. Protected by Turnstile and a stricter " +
    "5-per-IP-per-hour rate limit than leads. Upload the CV first via " +
    "POST /api/v1/applicant-cv and pass the returned URL as `cv_url`.",
  request: {
    body: {
      content: {
        "application/json": { schema: applicantRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Application accepted and persisted",
      content: {
        "application/json": { schema: applicantCreatedResponseSchema },
      },
    },
    400: {
      description: "Malformed JSON or field validation failure",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    403: {
      description: "Turnstile verification failed",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "Job does not exist or is not open",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    410: {
      description: "Application deadline has passed",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (5 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(applicantsRouteConfig);

// Mirrors src/routes/api/v1/(public)/applicant-cv/index.ts.
// multipart/form-data, so there is no Zod request schema to reference — the
// constraints below are enforced imperatively in the handler.
export const applicantCvRouteConfig = {
  method: "post" as const,
  path: "/api/v1/applicant-cv",
  summary: "Upload an applicant CV and get its URL",
  description:
    "Accepts `multipart/form-data` with a single `file` field: PDF, DOC or " +
    "DOCX, at most 10MB. Returns the CMS media URL to pass as `cv_url` on " +
    "POST /api/v1/applicants. Rate limited to 5 uploads per IP per hour.",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().openapi({ type: "string", format: "binary" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "CV stored; URL returned",
      content: {
        "application/json": { schema: applicantCvUploadedResponseSchema },
      },
    },
    400: {
      description: "Body is not multipart/form-data, or `file` is missing",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    413: {
      description: "File exceeds the 10MB limit",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    415: {
      description: "Unsupported file type (only PDF, DOC, DOCX)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (5 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(applicantCvRouteConfig);

// ─── Community write endpoints (owner-token, no account system) ────────────

// Mirrors src/routes/api/v1/(public)/community/questions/$slug.same-issue.ts.
export const communitySameIssueRouteConfig = {
  method: "post" as const,
  path: "/api/v1/community/questions/{slug}/same-issue",
  summary: "React same-issue to a published question",
  description:
    "Idempotent per client: the hashed client IP is the dedupe identity, so " +
    "a repeat reaction answers 200 with `deduped: true` and an unchanged " +
    "count. No Turnstile (one-click UX), so a request whose client IP " +
    "cannot be determined is refused with 400 rather than pooled into a " +
    "shared bucket. Rate limited to 30 per IP per hour. Takes no body.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Reaction recorded, or already present (`deduped: true`)",
      content: {
        "application/json": { schema: communitySameIssueResponseSchema },
      },
    },
    400: {
      description: "Client IP could not be determined",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "No published question with that slug",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (30 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communitySameIssueRouteConfig);

// Mirrors src/routes/api/v1/(public)/community/questions/$slug.withdraw.ts.
export const communityQuestionWithdrawRouteConfig = {
  method: "post" as const,
  path: "/api/v1/community/questions/{slug}/withdraw",
  summary: "Withdraw your own question using its owner token",
  description:
    "The owner token issued at submission is the only authorization. An " +
    "invalid token is answered with the SAME generic 404 as a missing slug " +
    "— deliberately indistinguishable, so the endpoint cannot be used to " +
    "probe which slugs exist. Rate limited to 20 per IP per hour.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    body: {
      content: {
        "application/json": { schema: communityWithdrawRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Question withdrawn",
      content: {
        "application/json": { schema: communityWithdrawResponseSchema },
      },
    },
    400: {
      description: "Malformed JSON or missing `ownerToken`",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "Unknown slug or wrong owner token (indistinguishable)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (20 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityQuestionWithdrawRouteConfig);

// Mirrors src/routes/api/v1/(public)/community/reviews/$slug.withdraw.ts.
// Same handler (handleCommunityWithdraw), same envelope, same generic-404
// policy — only the rate-limit key and the target table differ.
export const communityReviewWithdrawRouteConfig = {
  method: "post" as const,
  path: "/api/v1/community/reviews/{slug}/withdraw",
  summary: "Withdraw your own review using its owner token",
  description:
    "Identical semantics to the question withdraw endpoint: owner token is " +
    "the only authorization, and a wrong token is indistinguishable from a " +
    "missing slug (generic 404). Rate limited to 20 per IP per hour.",
  request: {
    params: z.object({
      slug: z.string(),
    }),
    body: {
      content: {
        "application/json": { schema: communityWithdrawRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Review withdrawn",
      content: {
        "application/json": { schema: communityWithdrawResponseSchema },
      },
    },
    400: {
      description: "Malformed JSON or missing `ownerToken`",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    404: {
      description: "Unknown slug or wrong owner token (indistinguishable)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (20 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityReviewWithdrawRouteConfig);

// Mirrors the POST handler of src/routes/api/v1/(public)/community/questions/index.ts.
// The GET on the same path is registered separately above; OpenAPI keys by
// (path, method) so both coexist.
export const communityQuestionSubmitRouteConfig = {
  method: "post" as const,
  path: "/api/v1/community/questions",
  summary: "Submit a community question for moderation",
  description:
    "Every submission enters moderation: the response `status` is always " +
    "`pending` and the question is absent from the public list until an " +
    "operator publishes it. `owner_token` is returned ONCE here and never " +
    "again — the client stores it to enable self-service withdrawal. " +
    "Protected by Turnstile and a 5-per-IP-per-hour rate limit.",
  request: {
    body: {
      content: {
        "application/json": { schema: communityQuestionSubmitSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Question accepted; awaiting moderation",
      content: {
        "application/json": { schema: communitySubmitResponseSchema },
      },
    },
    400: {
      description: "Malformed JSON or field validation failure",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    403: {
      description: "Turnstile verification failed",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (5 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityQuestionSubmitRouteConfig);

// Mirrors the POST handler of src/routes/api/v1/(public)/community/reviews/index.ts.
// `private_evidence_note` and `private_order_reference` are request-only
// moderation context — they are accepted here and never appear on any public
// response shape.
export const communityReviewSubmitRouteConfig = {
  method: "post" as const,
  path: "/api/v1/community/reviews",
  summary: "Submit a community review for moderation",
  description:
    "Same moderation contract as question submission: `status` is always " +
    "`pending`, and `owner_token` is returned only on this response. " +
    "`private_evidence_note` and `private_order_reference` are accepted as " +
    "operator-only context and are never echoed on a public read. " +
    "Protected by Turnstile and a 5-per-IP-per-hour rate limit.",
  request: {
    body: {
      content: {
        "application/json": { schema: communityReviewSubmitSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Review accepted; awaiting moderation",
      content: {
        "application/json": { schema: communitySubmitResponseSchema },
      },
    },
    400: {
      description: "Malformed JSON or field validation failure",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    403: {
      description: "Turnstile verification failed",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
    429: {
      description: "Rate limit exceeded (5 per IP per hour)",
      content: {
        "application/json": { schema: errorBodySchema },
      },
    },
  },
} as const;

openApiRegistry.registerPath(communityReviewSubmitRouteConfig);
