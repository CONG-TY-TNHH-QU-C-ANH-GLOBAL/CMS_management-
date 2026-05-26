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
  contactLocationsResponseSchema,
  faqsResponseSchema,
  integrationsResponseSchema,
  marqueeImagesResponseSchema,
  testimonialsResponseSchema,
} from "@/features/content/content.schemas";
import { translationsResponseSchema } from "@/features/i18n/i18n.schemas";
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
