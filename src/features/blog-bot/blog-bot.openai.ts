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
  // English keyword phrases describing an ideal hero photo for THIS article —
  // used to fetch a relevant stock/AI image. Tolerant: missing → [].
  image_keywords: z.array(z.string().max(80)).max(6).default([]),
});

export type GeneratedArticle = z.infer<typeof articleSchema>;

export interface GenerateResult {
  article: GeneratedArticle | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  error: string | null;
  /** Soft, non-fatal note (e.g. news sources unavailable). */
  warning: string | null;
  rawResponse: string;
}

const LOCALE_LABEL: Record<string, string> = {
  vi: "Vietnamese (tiếng Việt)",
  en: "English",
  zh: "Simplified Chinese (简体中文)",
};

const LENGTH_WORDS: Record<string, string> = {
  short: "400–600 words",
  medium: "700–1100 words",
  long: "1300–2000 words",
};

const DEPTH_INSTRUCTIONS: Record<string, string> = {
  basic:
    "Audience: beginners. Use simple, friendly language; explain any jargon; keep it approachable.",
  professional:
    "Audience: online sellers. Clear, credible, and practical; use industry terms but keep them accessible.",
  expert:
    "Audience: experienced operators. Go in-depth and nuanced; use precise terminology and advanced insight — WITHOUT fabricating data or numbers.",
};

const TYPE_PRESETS: Record<string, string> = {
  general:
    "Format: a standard informative article — clear intro, well-structured ## sections, short conclusion.",
  listicle:
    'Format: a LISTICLE. The title starts with a number (e.g. "7 …"). Body is a numbered list where each item has its own ## heading and 1–3 explanatory paragraphs. Add a short intro and a closing takeaway.',
  news: 'Format: a NEWS ROUNDUP. Synthesize the recent developments from the RECENT NEWS SOURCES below IN YOUR OWN WORDS — never copy sentences. Attribute points to their source inline, and end with a "## Nguồn tham khảo" section listing each source as a Markdown link. Keep claims aligned with the headlines; defer specifics to the linked sources instead of inventing details.',
  review:
    "Format: an evaluative REVIEW. Establish clear criteria, weigh pros and cons in ## sections, stay balanced and honest, end with a verdict. Do not fabricate specific numbers or claims.",
  knowledge:
    "Format: an educational HOW-TO / knowledge guide. Use clear ## steps or concepts, actionable advice, and practical examples. Teach the reader something genuinely useful.",
  product_service:
    "Format: a SERVICE-CATEGORY explainer. Educate the reader on the benefits, use-cases, and considerations of this service category in GENERAL terms. Do NOT invent specific THG prices, SLAs, or numbers.",
};

function buildMessages(
  campaign: BlogBotCampaignRow,
  topic: string,
  existingTitles: string[],
  newsContext: string | null,
): PromptMessage[] {
  const localeLabel = LOCALE_LABEL[campaign.locale] ?? campaign.locale;
  const typePreset = TYPE_PRESETS[campaign.article_type] ?? TYPE_PRESETS.general;
  const depth = DEPTH_INSTRUCTIONS[campaign.depth] ?? DEPTH_INSTRUCTIONS.professional;
  const lengthWords = LENGTH_WORDS[campaign.length] ?? LENGTH_WORDS.medium;
  const avoid =
    existingTitles.length > 0
      ? `\nAVOID duplicating these already-published articles (pick a distinct angle / title / slug):\n${existingTitles
          .slice(0, 40)
          .map((t) => `  - ${t}`)
          .join("\n")}`
      : "";
  const newsBlock = newsContext
    ? `\nRECENT NEWS SOURCES (base the roundup on these; cite each with its link):\n${newsContext}`
    : "";

  const system = `You are a content writer for THG Fulfill — a cross-border fulfillment / print-on-demand (POD) & dropshipping service connecting Vietnam, China, and the USA. You write blog articles for the company's website aimed at Vietnamese online sellers.

Write the article in ${localeLabel}.
${campaign.tone ? `Tone / style: ${campaign.tone}.` : ""}
${campaign.category ? `Content category: ${campaign.category}.` : ""}
${typePreset}
${depth}

HARD RULES (safety / brand):
- Output STRICT JSON only. No prose, no markdown fences. Start with { end with }.
- Do NOT fabricate specific THG service details, prices, delivery guarantees, or statistics. Speak generally; never invent numbers about THG.
- No sensitive, political, adult, or defamatory content. Do not name or disparage competitors.
- body_md is Markdown (headings ##, lists, bold). Target length: ${lengthWords}. Do NOT embed images.
- slug: lowercase a-z, 0-9 and hyphens only, derived from the title, max ~80 chars.
${campaign.guidelines_md ? `\nADDITIONAL OPERATOR GUIDELINES:\n${campaign.guidelines_md}` : ""}
${newsBlock}
${avoid}

JSON schema to return:
{
  "title": string,
  "slug": string,
  "excerpt": string (1-2 sentence summary),
  "body_md": string (Markdown article body),
  "category": string,
  "seo_title": string (<= 60 chars),
  "seo_description": string (<= 155 chars),
  "image_keywords": string[] (2-4 SHORT English phrases describing an ideal, on-topic hero photo for THIS specific article — concrete, photographable subjects, e.g. "warehouse fulfillment workers", "print on demand t-shirt". Avoid brand names, text, logos.)
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

/** Build the news search query for a 'news' campaign: prefer the category, else
 *  a trimmed topic. */
function newsQuery(campaign: BlogBotCampaignRow, topic: string): string {
  const cat = campaign.category?.trim();
  if (cat) return cat;
  return topic.slice(0, 80);
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
  // 'news' type: pull recent headlines to ground the roundup (best-effort — a
  // failure just means the model writes without fresh sources).
  let newsContext: string | null = null;
  let warning: string | null = null;
  if (campaign.article_type === "news") {
    const { fetchNews, formatNewsContext } = await import("@/features/blog-bot/blog-bot.news");
    const news = await fetchNews(newsQuery(campaign, topic), campaign.locale, 8);
    if (news.items.length > 0) newsContext = formatNewsContext(news.items);
    else warning = `Tin tức: ${news.error ?? "không có nguồn"} — viết không có nguồn mới.`;
  }

  const messages = buildMessages(campaign, topic, existingTitles, newsContext);
  const res = await callOpenAiWithJsonRecovery(apiKey, campaign.model, messages, baseUrl);

  const cost = estimateCostUsd(campaign.model, res.tokensIn, res.tokensOut);

  if (res.apiError) {
    return {
      article: null,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: cost,
      error: res.apiError.message,
      warning,
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
      warning,
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
      warning,
      rawResponse: res.rawResponse,
    };
  }

  return {
    article: parsed.data,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: cost,
    error: null,
    warning,
    rawResponse: res.rawResponse,
  };
}
