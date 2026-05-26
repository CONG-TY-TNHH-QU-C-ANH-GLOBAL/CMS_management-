// Public response schemas for /api/v1 endpoints under the policies feature.
//
// Same discipline as other *.schemas.ts (Phase D2): extracted shapes of
// current runtime payloads.
//
// NOTE on drift vs landing's existing cmsSchemas.ts: landing's
// policyResponseSchema marks `body_md` as `z.string().nullable()`, but
// the backend service has `PolicyRow.body_md: string` (non-null, per
// policies.service.ts:21). The handler emits whatever the row has —
// non-null on the wire. The D5 cross-check in the follow-up landing
// PR will surface this and landing fixes ship there.
//
// Same pattern: landing's policy detail also lacks `updated_at` and
// `version` fields that the backend handler returns. Both will be
// added to landing in the follow-up.

import { z } from "zod";

const localeSchema = z.enum(["en", "vi", "zh"]);
const policyModeSchema = z.enum(["image", "text"]);

// Inner block of structured policy content (mode === "text").
// Source: PolicyTextBlock (policies.service.ts:10-14).
const policyTextBlockSchema = z.object({
  type: z.enum(["normal", "warn", "info"]),
  heading: z.string(),
  content: z.array(z.string()),
});

// Summary projection used by GET /api/v1/policies.
// Source: handler projection at policies/index.ts:19-26.
const policySummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  mode: policyModeSchema,
  summary: z.string().nullable(),
  position: z.number().int(),
});

// /api/v1/policies?lang=<en|vi|zh> response body.
// Built in policies/index.ts:17 as `{ locale, policies }`.
export const policiesResponseSchema = z.object({
  locale: localeSchema,
  policies: z.array(policySummarySchema),
});

export type PoliciesResponse = z.infer<typeof policiesResponseSchema>;

// Detail projection used by GET /api/v1/policies/{slug}.
// Source: handler projection at policies/$slug.ts:26-38.
//
// body_md is NON-NULL — matches PolicyRow.body_md type.
// image_list / text_blocks are parsed-from-JSON with fallback to []
// (handler line: `parseJson(...) ?? []`). They are ALWAYS present on
// the wire — never null.
const policyDetailSchema = z.object({
  slug: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  mode: policyModeSchema,
  body_md: z.string(),
  image_list: z.array(z.string()),
  text_blocks: z.array(policyTextBlockSchema),
  summary: z.string().nullable(),
  position: z.number().int(),
  updated_at: z.number().int(),
  version: z.number().int(),
});

// /api/v1/policies/{slug}?lang=<en|vi|zh> response body.
// Built in policies/$slug.ts:24 as `{ locale, policy }`.
export const policyResponseSchema = z.object({
  locale: localeSchema,
  policy: policyDetailSchema,
});

export type PolicyResponse = z.infer<typeof policyResponseSchema>;
