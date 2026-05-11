import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { HomepageBlock, HomepageBlockKind, HomepageLocale, HomepagePayload } from "@/features/homepage";

const LOCALE = z.enum(["en", "vi", "zh"]);
const KIND = z.enum([
  "hero",
  "trust",
  "services_grid",
  "about_video",
  "marquee",
  "sellers",
  "process",
  "advantages",
  "integrations",
  "testimonials",
  "faq",
  "contact",
]);

export const listHomepageBlocksFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ locale: LOCALE }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listHomepageBlocks } = await import("@/features/homepage");
    await requireSession("viewer");
    return { locale: data.locale, blocks: await listHomepageBlocks(data.locale) };
  });

const upsertSchema = z.object({
  kind: KIND,
  locale: LOCALE,
  // Payload is operator-edited string key/value — admin form only edits text.
  // Restricting to string keeps TanStack Start RPC serialization happy.
  payload: z.record(z.string()),
  position: z.number().int().min(0).optional(),
});

export const upsertHomepageBlockFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertHomepageBlock } = await import("@/features/homepage");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const block = await upsertHomepageBlock(me.id, data);
    await bumpCmsRev();
    return { block };
  });
