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

export type PublicMonthlySourcingResponse = z.infer<typeof monthlySourcingResponseSchema>;
