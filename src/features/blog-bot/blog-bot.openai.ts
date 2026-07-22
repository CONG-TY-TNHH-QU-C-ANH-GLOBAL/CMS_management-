// Blog Auto-Bot — article generation via OpenAI (Phase 1).
//
// Reuses the translation subsystem's hardened Chat Completions client
// (callOpenAiWithJsonRecovery: json_object mode, transient-retry, malformed-
// JSON recovery) instead of re-rolling a fetch client. We only add the
// blog-specific prompt + output schema here.
//
// Output is ALWAYS a draft: the caller saves it as status='review'. No
// publishing decision happens in this module.

import { z } from "zod";

import { callOpenAiWithJsonRecovery } from "@/features/translations/translations.openai";
import type { PromptMessage } from "@/features/translations/translations.prompt";
import type { BlogBotCampaignRow } from "@/features/blog-bot/blog-bot.service";

// gpt-4o mirrors the copilot model; mini mirrors the translation default.
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK["gpt-4o-mini"];
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

// The article shape we ask the model to return. Kept aligned with the
// upsertBlogPost input (slug/title/excerpt/body_md/category/seo_*).
const articleSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase a-z, 0-9, hyphen"),
  excerpt: z.string().max(2000).default(""),
  body_md: z.string().min(1).max(100000),
  category: z.string().max(100).nullable().default(null),
  seo_title: z.string().max(200).nullable().default(null),
  seo_description: z.string().max(500).nullable().default(null),
});

export type GeneratedArticle = z.infer<typeof articleSchema>;

export interface GenerateResult {
  article: GeneratedArticle | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  error: string | null;
  rawResponse: string;
}

const LOCALE_LABEL: Record<string, string> = {
  vi: "Vietnamese (tiếng Việt)",
  en: "English",
  zh: "Simplified Chinese (简体中文)",
};

function buildMessages(
  campaign: BlogBotCampaignRow,
  topic: string,
  existingTitles: string[],
): PromptMessage[] {
  const localeLabel = LOCALE_LABEL[campaign.locale] ?? campaign.locale;
  const avoid =
    existingTitles.length > 0
      ? `\nAVOID duplicating these already-published articles (pick a distinct angle / title / slug):\n${existingTitles
          .slice(0, 40)
          .map((t) => `  - ${t}`)
          .join("\n")}`
      : "";

  const system = `You are a content writer for THG Fulfill — a cross-border fulfillment / print-on-demand (POD) & dropshipping service connecting Vietnam, China, and the USA. You write blog articles for the company's website aimed at Vietnamese online sellers.

Write the article in ${localeLabel}.
${campaign.tone ? `Tone / style: ${campaign.tone}.` : ""}
${campaign.category ? `Content category: ${campaign.category}.` : ""}

HARD RULES (safety / brand):
- Output STRICT JSON only. No prose, no markdown fences. Start with { end with }.
- Do NOT fabricate specific THG service details, prices, delivery guarantees, or statistics. Speak generally; never invent numbers about THG.
- No sensitive, political, adult, or defamatory content. Do not name or disparage competitors.
- body_md is Markdown (headings ##, lists, bold). 600–1200 words. Do NOT embed images.
- slug: lowercase a-z, 0-9 and hyphens only, derived from the title, max ~80 chars.
${campaign.guidelines_md ? `\nADDITIONAL OPERATOR GUIDELINES:\n${campaign.guidelines_md}` : ""}
${avoid}

JSON schema to return:
{
  "title": string,
  "slug": string,
  "excerpt": string (1-2 sentence summary),
  "body_md": string (Markdown article body),
  "category": string,
  "seo_title": string (<= 60 chars),
  "seo_description": string (<= 155 chars)
}`;

  const user =
    campaign.topic_source === "seed_list"
      ? `Write today's article on this topic: "${topic}".`
      : `Follow this instruction to choose a fresh topic and write today's article:\n\n${topic}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Generate one draft article for a campaign. `topic` is the seed topic (seed
 *  list) or the natural-language instruction (instruction mode). Never throws
 *  for API/parse failures — returns error in the result. */
export async function generateArticle(
  apiKey: string,
  baseUrl: string | undefined,
  campaign: BlogBotCampaignRow,
  topic: string,
  existingTitles: string[],
): Promise<GenerateResult> {
  const messages = buildMessages(campaign, topic, existingTitles);
  const res = await callOpenAiWithJsonRecovery(apiKey, campaign.model, messages, baseUrl);

  const cost = estimateCostUsd(campaign.model, res.tokensIn, res.tokensOut);

  if (res.apiError) {
    return {
      article: null,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: cost,
      error: res.apiError.message,
      rawResponse: res.rawResponse,
    };
  }
  if (!res.parsed) {
    return {
      article: null,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: cost,
      error: "OpenAI trả JSON không hợp lệ (parse thất bại sau 2 lần).",
      rawResponse: res.rawResponse,
    };
  }

  const parsed = articleSchema.safeParse(res.parsed);
  if (!parsed.success) {
    return {
      article: null,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: cost,
      error: `Bài sinh ra không đúng cấu trúc: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
      rawResponse: res.rawResponse,
    };
  }

  return {
    article: parsed.data,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: cost,
    error: null,
    rawResponse: res.rawResponse,
  };
}
