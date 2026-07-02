import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  CommunityQuestionJoinedRow,
  CommunityQuestionStatus,
} from "@/features/community";

const STATUSES = z.enum(["pending", "published", "rejected"]);

export const listCommunityQuestionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listCommunityQuestionsAdmin } = await import("@/features/community");
  await requireSession("editor");
  return { questions: await listCommunityQuestionsAdmin({ limit: 200 }) };
});

const updateStatusSchema = z.object({
  id: z.number().int().positive(),
  status: STATUSES,
});

export const updateCommunityQuestionStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { setCommunityQuestionStatus } = await import("@/features/community");
    await requireSession("editor");
    await setCommunityQuestionStatus(data.id, data.status);
    return { ok: true as const };
  });

const expertAnswerSchema = z.object({
  id: z.number().int().positive(),
  expert_answer: z.string().trim().max(8000).nullable(),
  verified: z.boolean(),
});

export const saveCommunityExpertAnswerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => expertAnswerSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { saveCommunityExpertAnswer } = await import("@/features/community");
    await requireSession("editor");
    const answer = data.expert_answer && data.expert_answer.length > 0 ? data.expert_answer : null;
    await saveCommunityExpertAnswer(data.id, answer, data.verified);
    return { ok: true as const };
  });
