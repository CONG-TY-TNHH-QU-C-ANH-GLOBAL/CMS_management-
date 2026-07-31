// Public response schema for POST /api/v1/leads.
//
// The REQUEST contract is not restated here — it is `leadRequestBaseSchema`,
// exported from ./lead-request, which is also what parseLeadRequest() runs at
// runtime. One object, one source of truth; src/openapi/paths.ts imports it
// directly and scripts/check-openapi-drift.ts asserts the identity.
//
// This file holds only the success envelope, which the route builds inline
// (src/routes/api/v1/(public)/leads/index.ts:96) and which no other module
// owned until now.

import { z } from "zod";

// 201 body. `ok` is a literal `true` — the endpoint never returns `ok: false`;
// failures are the `{ error }` envelope with a 4xx status (corsError).
// `id` is the D1 autoincrement lead id, echoed so a client can correlate a
// submission with an operator follow-up.
export const leadCreatedResponseSchema = z.object({
  ok: z.literal(true),
  id: z.number().int(),
});

export type LeadCreatedResponse = z.infer<typeof leadCreatedResponseSchema>;
