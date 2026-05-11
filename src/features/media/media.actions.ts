import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { MediaRow, MediaStatus } from "@/features/media";

export const listMediaFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        tag: z.string().max(80).nullable().optional(),
        status: z.enum(["pending", "ready", "archived"]).nullable().optional(),
        search: z.string().max(200).nullable().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listMedia, listTags } = await import("@/features/media");
    await requireSession("viewer");
    const [list, tags] = await Promise.all([listMedia(data), listTags()]);
    return { ...list, tags };
  });

const updateMetaSchema = z.object({
  id: z.number().int().positive(),
  alt_text: z.string().max(500).optional(),
  tag: z.string().max(80).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  status: z.enum(["pending", "ready", "archived"]).optional(),
});

export const updateMediaMetaFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateMetaSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateMediaMeta } = await import("@/features/media");
    const me = await requireSession("editor");
    const { id, ...rest } = data;
    const media = await updateMediaMeta(me.id, id, rest);
    return { media };
  });

export const deleteMediaFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteMedia } = await import("@/features/media");
    const me = await requireSession("editor");
    await deleteMedia(me.id, data.id);
    return { ok: true as const };
  });

// Hard-deletes EVERY row in the media table + best-effort R2 purge.
// Admin-only because the blast radius is the whole library. UI guards with
// a typed confirmation phrase before calling.
export const deleteAllMediaFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ confirm: z.literal("XOA-TAT-CA") }).parse(data),
  )
  .handler(async () => {
    const { requireSession } = await import("@/features/auth");
    const { deleteAllMedia } = await import("@/features/media");
    const me = await requireSession("admin");
    const count = await deleteAllMedia(me.id);
    return { deleted: count };
  });
