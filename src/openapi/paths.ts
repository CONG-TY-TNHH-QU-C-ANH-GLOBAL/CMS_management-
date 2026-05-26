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
  blogListResponseSchema,
  blogPostResponseSchema,
} from "@/features/blog/blog.schemas";
import {
  jobResponseSchema,
  jobsResponseSchema,
} from "@/features/careers/careers.schemas";
import {
  contactLocationsResponseSchema,
  faqsResponseSchema,
  integrationsResponseSchema,
  marqueeImagesResponseSchema,
  servicesResponseSchema,
  testimonialsResponseSchema,
} from "@/features/content/content.schemas";
import { homepageResponseSchema } from "@/features/homepage/homepage.schemas";
import { translationsResponseSchema } from "@/features/i18n/i18n.schemas";
import {
  policiesResponseSchema,
  policyResponseSchema,
} from "@/features/policies/policies.schemas";
import {
  pricingResponseSchema,
  pricingTableResponseSchema,
} from "@/features/pricing/pricing.schemas";
import { siteSettingsResponseSchema } from "@/features/settings/settings.schemas";
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
