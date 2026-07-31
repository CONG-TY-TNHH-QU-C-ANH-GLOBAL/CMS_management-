// Community Hub — canonical public response schemas (Phase D contract).
//
// These are the single source of truth for the public wire shapes. The
// OpenAPI path configs in src/openapi/paths.ts MUST import these exact
// objects (identity-checked by scripts/check-openapi-drift.ts).
//
// Privacy: author_email, ip, user_agent, utm_json and moderation-internal
// fields are intentionally ABSENT from every schema here — they exist only
// on admin server functions (community.actions.ts).

import { z } from "zod";

export const communityCategoryItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  position: z.number().int(),
});

export const communityCategoriesResponseSchema = z.object({
  categories: z.array(communityCategoryItemSchema),
});
export type CommunityCategoriesResponse = z.infer<typeof communityCategoriesResponseSchema>;

const communityCategoryRefSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
  })
  .nullable();

export const communityQuestionSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  category: communityCategoryRefSchema,
  has_expert_answer: z.boolean(),
  verified: z.boolean(),
  // Landing derives noindex from this: computed server-side as
  // published AND verified AND expert answer (community.policy.ts).
  indexable: z.boolean(),
  same_issue_count: z.number().int(),
  published_at: z.number().int().nullable(),
});

export const communityQuestionsResponseSchema = z.object({
  questions: z.array(communityQuestionSummarySchema),
});
export type CommunityQuestionsResponse = z.infer<typeof communityQuestionsResponseSchema>;

export const communityQuestionDetailSchema = z.object({
  slug: z.string(),
  title: z.string(),
  body: z.string(),
  category: communityCategoryRefSchema,
  author_name: z.string(),
  expert_answer: z.string().nullable(),
  expert_answer_updated_at: z.number().int().nullable(),
  verified: z.boolean(),
  indexable: z.boolean(),
  same_issue_count: z.number().int(),
  published_at: z.number().int().nullable(),
});

export const communityQuestionResponseSchema = z.object({
  question: communityQuestionDetailSchema,
});
export type CommunityQuestionResponse = z.infer<typeof communityQuestionResponseSchema>;

// ─── Verified Reviews (Sprint 4) ───────────────────────────────────────────
// Privacy: reviewer_email, ip, user_agent, utm_json, owner_token_hash and the
// private_evidence_note / private_order_reference moderation fields are
// intentionally ABSENT — they live only on admin server functions.

export const communityReviewSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  category: communityCategoryRefSchema,
  rating: z.number().int().min(1).max(5).nullable(),
  verified: z.boolean(),
  // Landing derives noindex from this: computed server-side as published AND
  // verified AND non-thin body (community.policy.ts).
  indexable: z.boolean(),
  published_at: z.number().int().nullable(),
});

export const communityReviewsResponseSchema = z.object({
  reviews: z.array(communityReviewSummarySchema),
});
export type CommunityReviewsResponse = z.infer<typeof communityReviewsResponseSchema>;

export const communityReviewDetailSchema = z.object({
  slug: z.string(),
  title: z.string(),
  body: z.string(),
  category: communityCategoryRefSchema,
  reviewer_name: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
  public_summary: z.string().nullable(),
  verified: z.boolean(),
  indexable: z.boolean(),
  published_at: z.number().int().nullable(),
});

export const communityReviewResponseSchema = z.object({
  review: communityReviewDetailSchema,
});
export type CommunityReviewResponse = z.infer<typeof communityReviewResponseSchema>;

// POST /api/v1/community/questions/{slug}/same-issue response body.
// Built in $slug.same-issue.ts:36 as `{ ok, same_issue_count, deduped }`.
// `deduped: true` means this client's hashed IP had already reacted, so the
// count is unchanged — it is a SUCCESS, not an error, and the endpoint stays
// idempotent per client.
export const communitySameIssueResponseSchema = z.object({
  ok: z.literal(true),
  same_issue_count: z.number().int(),
  deduped: z.boolean(),
});
export type CommunitySameIssueResponse = z.infer<typeof communitySameIssueResponseSchema>;

// POST /api/v1/community/questions/{slug}/withdraw and
// POST /api/v1/community/reviews/{slug}/withdraw response body.
// Both routes delegate to handleCommunityWithdraw (community.http.ts:97),
// which emits `{ ok: true, withdrawn: true }`. A wrong or missing owner token
// is reported through the `{ error }` envelope with 404/400, never as
// `ok: false` — so both literals are always `true` on the wire.
export const communityWithdrawResponseSchema = z.object({
  ok: z.literal(true),
  withdrawn: z.literal(true),
});
export type CommunityWithdrawResponse = z.infer<typeof communityWithdrawResponseSchema>;

// Request body for both withdraw endpoints. The owner token is the opaque
// secret handed to the submitter at creation time; it is the ONLY authorization
// on these routes (no account system), so an invalid token must be answered
// with the generic 404 rather than a distinguishable 403.
// Lives here, not in community.http.ts, so src/openapi/paths.ts can reference
// the same object the handler validates against.
export const communityWithdrawRequestSchema = z.object({ ownerToken: z.string().min(1) });
export type CommunityWithdrawRequest = z.infer<typeof communityWithdrawRequestSchema>;

// ─── Public submit contracts (Q&A + Reviews) ───────────────────────────────
// Both live here rather than inline in the route files so src/openapi/paths.ts
// references the SAME objects the handlers validate against.

// POST /api/v1/community/questions request body.
export const communityQuestionSubmitSchema = z.object({
  title: z.string().trim().min(8, "Tiêu đề tối thiểu 8 ký tự").max(200),
  body: z.string().trim().min(20, "Nội dung tối thiểu 20 ký tự").max(5000),
  category_slug: z.string().trim().max(80).optional().nullable(),
  author_name: z.string().trim().min(1, "Tên không được rỗng").max(80),
  author_email: z.string().trim().email("Email không hợp lệ").max(254),
  locale: z.enum(["en", "vi", "zh"]).optional().nullable(),
  utm: z.record(z.string()).optional().nullable(),
  turnstile_token: z.string().min(1, "Missing Turnstile token"),
});
export type CommunityQuestionSubmit = z.infer<typeof communityQuestionSubmitSchema>;

// POST /api/v1/community/reviews request body. `private_evidence_note` and
// `private_order_reference` are REQUEST-ONLY moderation context: the submitter
// may supply them, and they never appear on any public response.
export const communityReviewSubmitSchema = z.object({
  title: z.string().trim().min(8, "Tiêu đề tối thiểu 8 ký tự").max(200),
  body: z.string().trim().min(20, "Nội dung tối thiểu 20 ký tự").max(5000),
  category_slug: z.string().trim().max(80).optional().nullable(),
  reviewer_name: z.string().trim().min(1, "Tên không được rỗng").max(80),
  reviewer_email: z.string().trim().email("Email không hợp lệ").max(254),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  locale: z.enum(["en", "vi", "zh"]).optional().nullable(),
  private_evidence_note: z.string().trim().max(2000).optional().nullable(),
  private_order_reference: z.string().trim().max(200).optional().nullable(),
  utm: z.record(z.string()).optional().nullable(),
  turnstile_token: z.string().min(1, "Missing Turnstile token"),
});
export type CommunityReviewSubmit = z.infer<typeof communityReviewSubmitSchema>;

// 201 body for both submit endpoints.
// `status` is always the literal "pending": every public submission enters
// moderation, so a consumer must render the pending state and must never
// expect published content back from a submit.
// `owner_token` is returned HERE AND ONLY HERE — never on list or detail — so
// the submitter's browser can later self-service a withdrawal.
export const communitySubmitResponseSchema = z.object({
  ok: z.literal(true),
  id: z.number().int(),
  slug: z.string(),
  status: z.literal("pending"),
  owner_token: z.string(),
});
export type CommunitySubmitResponse = z.infer<typeof communitySubmitResponseSchema>;
