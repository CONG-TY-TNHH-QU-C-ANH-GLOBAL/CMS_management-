// Public response schemas for /api/v1 endpoints under the pricing feature.
//
// Same discipline as other *.schemas.ts (Phase D2): extracted shapes of
// current runtime payloads.
//
// NOTE on drift vs landing's existing cmsSchemas.ts: landing's
// pricingTableMetaSchema is missing `id` + `updated_at`, and its
// pricingTableResponseSchema is missing `id`, `description`,
// `updated_at`. Backend handler emits all of these. The D5 cross-check
// in the follow-up landing PR will surface this; landing fixes ship in
// that follow-up.

import { z } from "zod";

const pricingKindSchema = z.enum(["weight_grid", "meta_kv"]);
const pricingStatusSchema = z.enum(["draft", "live", "archived"]);

// Pricing table summary used by GET /api/v1/pricing.
// Source: PricingTableSummary (pricing.service.ts:21-31), emitted by
// listPricingTables() with row_count/col_count computed server-side.
const pricingTableSummarySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  kind: pricingKindSchema,
  version: z.number().int(),
  status: pricingStatusSchema,
  updated_at: z.number().int(),
  row_count: z.number().int(),
  col_count: z.number().int(),
});

const pricingCategorySchema = z.object({
  name: z.string(),
  tables: z.array(pricingTableSummarySchema),
});

// /api/v1/pricing response body.
// Built in pricing/index.ts:12 as `{ categories }`.
// Note: NOT localized — pricing tables are language-agnostic.
export const pricingResponseSchema = z.object({
  categories: z.array(pricingCategorySchema),
});

export type PricingResponse = z.infer<typeof pricingResponseSchema>;

// Pricing table detail used by GET /api/v1/pricing/{slug}.
// schema_json and data_json are parsed independently — if one is
// malformed the other still surfaces. After parse, `schema` and `data`
// are unknown blobs (shape varies per table kind). Consumers narrow.
const pricingTableDetailSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  kind: pricingKindSchema,
  description: z.string().nullable(),
  schema: z.unknown(),
  data: z.unknown(),
  version: z.number().int(),
  status: pricingStatusSchema,
  updated_at: z.number().int(),
});

// /api/v1/pricing/{slug} response body.
// Built in pricing/$slug.ts:22 as `{ table }`.
export const pricingTableResponseSchema = z.object({
  table: pricingTableDetailSchema,
});

export type PricingTableResponse = z.infer<typeof pricingTableResponseSchema>;
