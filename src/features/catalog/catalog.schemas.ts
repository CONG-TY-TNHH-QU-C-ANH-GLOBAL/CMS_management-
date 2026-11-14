// Public response schema for /api/v1/catalog-overrides.
//
// Same discipline as the other *.schemas.ts modules: the shape is extracted
// from the handler that ships, and src/openapi/contract-bindings.ts asserts the
// route config registers THIS object rather than a lookalike.

import { z } from "zod";

const catalogOverrideSchema = z.object({
  /** Hub product id — the `id` of a product from hub.thgfulfill.com/api/public/catalog. */
  product_id: z.string(),
  /** Design-template link; when set it replaces the Hub's own templateUrl. */
  template_url: z.string().nullable(),
  /** The catalog price already includes shipping — this product's own setting,
   *  or the catalog-wide default when the product has none. */
  price_includes_shipping: z.boolean(),
});

export const catalogOverridesResponseSchema = z.object({
  /** Applies to every product that is not listed in `overrides`. */
  price_includes_shipping_default: z.boolean(),
  overrides: z.array(catalogOverrideSchema),
});

export type CatalogOverridesResponse = z.infer<typeof catalogOverridesResponseSchema>;
