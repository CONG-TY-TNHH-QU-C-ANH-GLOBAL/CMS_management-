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

import { faqsResponseSchema } from "@/features/content/content.schemas";
import { openApiRegistry } from "./registry";

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
