import { z } from "zod";

export const eventSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  locale: z.enum(["en", "vi", "zh"]),
  title: z.string(),
  summary: z.string().nullable(),
  body_md: z.string().nullable(),
  cover_url: z.string().nullable(),
  event_date: z.string(),
  end_date: z.string().nullable(),
  location: z.string().nullable(),
  role: z.string().nullable(),
  url: z.string().nullable(),
  video_url: z.string().nullable(),
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
});
export const eventsResponseSchema = z.object({
  locale: z.enum(["en", "vi", "zh"]),
  events: z.array(eventSchema),
});
export const eventResponseSchema = z.object({ event: eventSchema });
