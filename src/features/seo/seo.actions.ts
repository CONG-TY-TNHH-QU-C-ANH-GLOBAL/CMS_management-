import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const seoPageInput = z.object({
  route: z.string().trim().startsWith("/").max(200),
  locale: z.enum(["vi", "en", "zh"]),
  title: z.string().trim().min(1).max(200),
  meta_description: z.string().trim().max(500).nullable(),
  og_image_url: z.string().trim().url().max(500).nullable(),
  indexable: z.number().int().min(0).max(1),
  status: z.enum(["draft", "live", "archived"]),
  translation_status: z.enum(["draft", "reviewed", "stale"]),
});

export const listSeoPagesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listSeoPages } = await import("./seo.service");
  await requireSession("editor");
  return { pages: await listSeoPages() };
});

export const saveSeoPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => seoPageInput.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { saveSeoPage } = await import("./seo.service");
    const user = await requireSession("editor");
    await saveSeoPage(data, user.id);
    return { ok: true as const };
  });
