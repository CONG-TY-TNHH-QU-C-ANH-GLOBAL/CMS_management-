import { z } from "zod";

export const seoPageSchema = z.object({
  route: z.string(),
  locale: z.enum(["vi", "en", "zh"]),
  title: z.string(),
  meta_description: z.string().nullable(),
  og_image_url: z.string().nullable(),
  indexable: z.boolean(),
  updated_at: z.number().int(),
});

export const seoPagesResponseSchema = z.object({ pages: z.array(seoPageSchema) });
export type SeoPagesResponse = z.infer<typeof seoPagesResponseSchema>;
