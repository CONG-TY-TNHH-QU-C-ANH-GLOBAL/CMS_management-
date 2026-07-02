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
  // published AND (verified OR expert answer present).
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
