import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parseProductId } from "./catalog.productId";

export type { CatalogOverrideRow, CatalogSettings } from "./catalog.service";

const upsertInput = z.object({
  // A bare id or a catalog link — normalised to the id here so the table never
  // stores a URL in the key column.
  product: z
    .string()
    .max(500)
    .transform((value, ctx) => {
      const id = parseProductId(value);
      if (!id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Không nhận ra sản phẩm — dán link catalog có productId=… hoặc ID sản phẩm.",
        });
        return z.NEVER;
      }
      return id;
    }),
  label: z.string().max(200).nullable().optional(),
  template_url: z.string().url().max(1000).nullable().optional(),
  /** null = follow the catalog-wide default. */
  price_includes_shipping: z.boolean().nullable(),
});

export const listCatalogOverridesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listCatalogOverrides, getCatalogSettings } = await import("@/features/catalog");
  await requireSession("viewer");
  const [overrides, settings] = await Promise.all([listCatalogOverrides(), getCatalogSettings()]);
  return { overrides, settings };
});

export const updateCatalogSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ price_includes_shipping_default: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateCatalogSettings } = await import("@/features/catalog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const settings = await updateCatalogSettings(me.id, data);
    await bumpCmsRev();
    return { settings };
  });

export const upsertCatalogOverrideFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertInput.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertCatalogOverride } = await import("@/features/catalog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const override = await upsertCatalogOverride(me.id, {
      product_id: data.product,
      label: data.label,
      template_url: data.template_url,
      price_includes_shipping: data.price_includes_shipping,
    });
    await bumpCmsRev();
    return { override };
  });

export const deleteCatalogOverrideFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteCatalogOverride } = await import("@/features/catalog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteCatalogOverride(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });
