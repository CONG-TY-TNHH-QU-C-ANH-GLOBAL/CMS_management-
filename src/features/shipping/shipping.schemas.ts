// Public response schemas for /api/v1/shipping-routes[/{slug}].
//
// EXTRACTED, not designed — these describe exactly what the handlers at
// src/routes/api/v1/(public)/shipping-routes/{index,$slug}.ts already emit.
// No normalization, no tightening: the landing's shipping-policy route is a
// live consumer and any narrowing here becomes a runtime rejection there.
//
// Locale rule (shipping.service.ts:80-176): VI reads `shipping_routes`
// directly; EN/ZH JOIN `shipping_route_translations` filtered to
// `status='reviewed'`, then fall back to legacy per-locale rows whose
// visibility is still owned by the VI source row. There is NO cross-locale
// content fallback — an unreviewed EN route is absent from the list and 404s
// on detail.

import { z } from "zod";

const localeSchema = z.enum(["en", "vi", "zh"]);

// List item — the handler projects a strict subset of ShippingRouteRow
// (shipping-routes/index.ts:20-27). `body_md`, `notes` and `tables` are
// detail-only and deliberately absent from the list.
const shippingRouteSummarySchema = z.object({
  slug: z.string(),
  position: z.number().int(),
  title: z.string(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  kind: z.string().nullable(),
});

// /api/v1/shipping-routes?lang= response body.
// `total` is the length of `routes` in the same response — it is NOT a
// pagination total, because this endpoint is unpaginated and returns every
// live route for the locale ordered by (position, slug).
export const shippingRoutesResponseSchema = z.object({
  locale: localeSchema,
  routes: z.array(shippingRouteSummarySchema),
  total: z.number().int(),
});

export type ShippingRoutesResponse = z.infer<typeof shippingRoutesResponseSchema>;

// A rate/coverage table attached to one route. `columns_json` / `rows_json`
// are parsed server-side; a malformed column or row blob degrades to `[]`
// rather than failing the request (shipping-routes/$slug.ts:8-11) — same
// fail-safe policy as service-blocks `payload`.
const shippingTableSchema = z.object({
  caption: z.string().nullable(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
});

const shippingRouteDetailSchema = z.object({
  slug: z.string(),
  position: z.number().int(),
  title: z.string(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  kind: z.string().nullable(),
  body_md: z.string().nullable(),
  notes: z.array(z.string()),
  tables: z.array(shippingTableSchema),
  updated_at: z.number().int(),
});

// /api/v1/shipping-routes/{slug}?lang= response body.
export const shippingRouteResponseSchema = z.object({
  locale: localeSchema,
  route: shippingRouteDetailSchema,
});

export type ShippingRouteResponse = z.infer<typeof shippingRouteResponseSchema>;
