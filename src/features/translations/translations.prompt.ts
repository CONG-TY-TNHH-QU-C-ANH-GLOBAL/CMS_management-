// PURE: prompt builder for the /translate endpoint. Composes system message
// + glossary injection + user content. See spec §5.

import type { GlossaryRow } from "./glossary.service";

export const PROMPT_VERSION_V1 = "v1";

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface BuildPromptInput {
  entityType: string;
  sourceFields: Record<string, string>;
  targetLocales: ("en" | "zh")[];
  glossary: GlossaryRow[];
}

/** Build the messages array sent to OpenAI Chat Completions.
 *  Returns [system, user]. Caller appends any retry messages. */
export function buildPrompt(input: BuildPromptInput): PromptMessage[] {
  const glossaryLines = input.glossary
    .map((g) => `  "${g.term_vi}" → en: "${g.term_en}" | zh: "${g.term_zh}"`)
    .join("\n");

  const localesText = input.targetLocales.join(" + ");

  const systemContent = `You localize Vietnamese marketing copy for THG Fulfill — a cross-border fulfillment service connecting Vietnam, China, and the USA. Goal: produce naturally persuasive English and Mandarin copy. This is LOCALIZATION, not literal translation: preserve sales tone, urgency, and clarity.

GLOSSARY — translate these terms exactly as specified:
${glossaryLines || "  (no glossary terms configured yet)"}

RULES:
- Output STRICT JSON. No prose, no markdown fences. Start with { and end with }.
- Schema: { ${input.targetLocales.map((l) => `"${l}": { ...same field keys as input... }`).join(", ")} }
- Preserve all emoji, bullet markers (✅ ⛔ 📌 -), and line-break structure.
- Newlines stay as \\n.
- DO NOT add or remove any field keys.
- For numeric values, prices, addresses, URLs: keep verbatim.
- For currency: if VI says "$" assume USD; keep "$" in en; use "美元" in zh prose, "$" in tables.
- Vietnamese money amounts written WITHOUT a currency symbol (e.g. "7 triệu", "10tr", "15 triệu/tháng") are in Vietnamese đồng — when localizing, MAKE THE CURRENCY EXPLICIT so a foreign reader doesn't assume USD: en "7 million VND", zh "700万越南盾". Do NOT add a currency to non-money numbers (counts, weights, dimensions, percentages, dates).
- Bullet count, heading count, and rough line count must match the source.`;

  const userContent = `Translate this ${input.entityType} row to ${localesText}:

${JSON.stringify({ vi: input.sourceFields }, null, 2)}`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}

/** Build the retry message appended when the first attempt produced
 *  unparseable JSON. Spec §4.3. */
export function buildRetryMessage(previousResponseText: string): PromptMessage[] {
  return [
    { role: "assistant", content: previousResponseText },
    {
      role: "user",
      content:
        "Your previous response was not valid JSON. Reply with the JSON object ONLY. " +
        "Do not wrap in markdown code fences. Do not add any prose before or after. " +
        "Start your response with `{` and end with `}`.",
    },
  ];
}
