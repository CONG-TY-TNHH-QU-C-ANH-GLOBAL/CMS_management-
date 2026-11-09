import { z } from "zod";

const MONTHLY_SOURCING_SLUG = /^thang-(?:[1-9]|1[0-2])-(?:20(?:2\d|[3-9]\d)|2100)$/;

export const monthlySourcingMonthSchema = z.object({
  month: z.number().int().min(1).max(12),
  title: z.string().min(1).max(200),
  slug: z.string().regex(MONTHLY_SOURCING_SLUG),
});

/** Public navbar contract.  `year: null` is an intentional empty state until
 * an editor activates the first year. */
export const monthlySourcingResponseSchema = z.object({
  year: z.number().int().min(2020).max(2100).nullable(),
  months: z.array(monthlySourcingMonthSchema),
});

/** One live month for the main-site page: title, the original PDF and its pre-rendered page images. */
export const monthlySourcingDetailSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  slug: z.string().regex(MONTHLY_SOURCING_SLUG),
  title: z.string().min(1).max(200),
  pdf_url: z.string().url(),
  pages: z.array(
    z.object({
      url: z.string().url(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  ),
});

export type PublicMonthlySourcingDetail = z.infer<typeof monthlySourcingDetailSchema>;
export type PublicMonthlySourcingResponse = z.infer<typeof monthlySourcingResponseSchema>;
