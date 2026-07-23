// Blog Auto-Bot — content verifier (Phase 3).
//
// Two independent safety layers on a generated article BEFORE it can publish:
//   1. OpenAI Moderation API (free) — categorical harmful-content check.
//   2. LLM-as-judge — scores the article against brand-safety rules + the
//      campaign's operator guidelines; catches fabricated service claims,
//      hallucinated numbers, sensitive/political content, false promises.
//
// Output is a Verdict stored on the run (verdict_json). In Phase 3 the verdict
// is advisory (every draft still lands as 'review' for a human). It becomes the
// hard gate for auto-publish in Phase 4: publish only if verdict.passed.
//
// Best-effort: on any verifier failure we return a verdict with `error` set and
// passed=false (fail-closed) — never throws, never blocks the draft from being
// saved for human review.

import { z } from "zod";

import { callOpenAiWithJsonRecovery } from "@/features/translations/translations.openai";
import type { PromptMessage } from "@/features/translations/translations.prompt";
import type { BlogBotCampaignRow } from "@/features/blog-bot/blog-bot.service";
import type { GeneratedArticle } from "@/features/blog-bot/blog-bot.openai";
import { estimateCostUsd } from "@/features/blog-bot/blog-bot.openai";

/** Minimum judge score (0-100) to be considered publish-safe. */
export const SCORE_THRESHOLD = 70;
const JUDGE_BODY_CAP = 8000;
const MOD_INPUT_CAP = 20_000;

export interface JudgeIssue {
  severity: "low" | "medium" | "high";
  message: string;
}

export interface Verdict {
  passed: boolean; // moderation clean AND judge safe AND score >= threshold
  moderation: { flagged: boolean; categories: string[] };
  judge: { safe: boolean; score: number; summary: string; issues: JudgeIssue[] };
  costUsd: number;
  model: string;
  error: string | null;
}

const judgeSchema = z.object({
  safe: z.boolean(),
  score: z.number().min(0).max(100),
  summary: z.string().max(600).default(""),
  issues: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]).default("medium"),
        message: z.string().max(400),
      }),
    )
    .max(20)
    .default([]),
});

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

/** OpenAI Moderation API — free categorical harmful-content classifier. */
async function moderate(
  apiKey: string,
  baseUrl: string,
  text: string,
): Promise<{ flagged: boolean; categories: string[] }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/moderations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, MOD_INPUT_CAP) }),
  });
  if (!res.ok) throw new Error(`Moderation ${res.status}`);
  const body = (await res.json()) as {
    results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
  };
  const r = body.results?.[0];
  const categories = r?.categories
    ? Object.entries(r.categories)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
    : [];
  return { flagged: r?.flagged === true || categories.length > 0, categories };
}

function buildJudgeMessages(
  campaign: BlogBotCampaignRow,
  article: GeneratedArticle,
): PromptMessage[] {
  const system = `You are a STRICT content-safety and brand reviewer for THG Fulfill — a cross-border fulfillment / POD / dropshipping company. You review a draft blog article before it is allowed to publish and return a JSON verdict.

Score 0-100 (100 = perfectly safe & on-brand). Mark safe=false if ANY high-severity issue exists.

Reject / flag for these (brand & safety):
- Fabricated specifics about THG's services, prices, delivery times, guarantees, or invented statistics. THG facts must stay general — no invented numbers.
- False or unverifiable promises ("guaranteed", "100%", specific ROI claims).
- Sensitive, political, adult, hateful, violent, or defamatory content; naming/disparaging competitors.
- Legal/medical/financial advice presented as fact.
- Spam, keyword stuffing, or incoherent/low-quality text.
${campaign.guidelines_md ? `\nOPERATOR GUIDELINES (treat violations as high severity):\n${campaign.guidelines_md}` : ""}

Output STRICT JSON only:
{
  "safe": boolean,
  "score": number (0-100),
  "summary": string (1-2 sentences, in Vietnamese),
  "issues": [ { "severity": "low"|"medium"|"high", "message": string (in Vietnamese) } ]
}`;

  const body = (article.body_md ?? "").slice(0, JUDGE_BODY_CAP);
  const user = `Review this draft:\n\nTITLE: ${article.title}\nEXCERPT: ${article.excerpt ?? ""}\nBODY:\n${body}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Run both verifier layers over a generated article. Never throws. */
export async function verifyArticle(
  env: { OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string },
  campaign: BlogBotCampaignRow,
  article: GeneratedArticle,
): Promise<Verdict> {
  const failClosed = (error: string, costUsd = 0): Verdict => ({
    passed: false,
    moderation: { flagged: false, categories: [] },
    judge: { safe: false, score: 0, summary: "", issues: [] },
    costUsd,
    model: campaign.model,
    error,
  });

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return failClosed("OPENAI_API_KEY chưa được set — không kiểm duyệt được.");
  const baseUrl = env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE;

  const fullText = `${article.title}\n\n${article.excerpt ?? ""}\n\n${article.body_md ?? ""}`;

  // Layer 1: moderation (free). A moderation transport failure is non-fatal —
  // we continue to the judge but note it.
  let moderation = { flagged: false, categories: [] as string[] };
  let modError: string | null = null;
  try {
    moderation = await moderate(apiKey, baseUrl, fullText);
  } catch (err) {
    modError = err instanceof Error ? err.message : String(err);
  }

  // Layer 2: LLM judge.
  const judgeRes = await callOpenAiWithJsonRecovery(
    apiKey,
    campaign.model,
    buildJudgeMessages(campaign, article),
    baseUrl,
  );
  const cost = estimateCostUsd(campaign.model, judgeRes.tokensIn, judgeRes.tokensOut);

  if (judgeRes.apiError) {
    return failClosed(`Judge lỗi: ${judgeRes.apiError.message}`, cost);
  }
  const parsed = judgeRes.parsed ? judgeSchema.safeParse(judgeRes.parsed) : null;
  if (!parsed || !parsed.success) {
    return failClosed("Judge trả JSON không hợp lệ.", cost);
  }

  const judge = parsed.data;
  const passed =
    !moderation.flagged && judge.safe && judge.score >= SCORE_THRESHOLD && modError === null;

  return {
    passed,
    moderation,
    judge,
    costUsd: cost,
    model: campaign.model,
    error: modError ? `Moderation lỗi (bỏ qua): ${modError}` : null,
  };
}
