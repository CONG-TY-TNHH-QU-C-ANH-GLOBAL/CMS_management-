// Public response schemas for /api/v1 endpoints under the partners feature.
//
// Same discipline as the other *.schemas.ts modules: the shape is extracted
// from the handler that ships, and src/openapi/contract-bindings.ts asserts the
// route config registers THIS object rather than a lookalike.

import { z } from "zod";

const partnerSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  name: z.string(),
  /**
   * Fully-resolved media URL, or null when no logo is set. The handler resolves
   * `logo_media_id` server-side the way the blog list resolves `thumbnail_url` —
   * the landing has no way to turn a media id into a URL on its own, which is
   * why /api/v1/integrations still renders as text-only logos.
   */
  logo_url: z.string().nullable(),
  url: z.string().nullable(),
  tier: z.string().nullable(),
});

export const partnersResponseSchema = z.object({
  partners: z.array(partnerSchema),
});

export type PartnersResponse = z.infer<typeof partnersResponseSchema>;
