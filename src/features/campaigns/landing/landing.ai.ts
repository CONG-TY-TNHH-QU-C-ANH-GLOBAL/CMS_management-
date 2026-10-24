// The one real AI boundary for landing uploads: a JSON-mode chat call through
// the translation subsystem's hardened client (transient retry + malformed-JSON
// recovery). Tests replace the whole thing — or mock fetch underneath it.

import { callOpenAiWithJsonRecovery } from "@/features/translations/translations.openai";

import type { JsonAiCall } from "./landing.format";

/** Same model as the copilot: the audit needs reading comprehension, and this runs once per
 *  upload, so cost is negligible next to a wrong price going live. */
export const LANDING_AI_MODEL = "gpt-4o";

export function openAiJsonCall(apiKey: string, baseUrl?: string): JsonAiCall {
  return async (messages) => {
    const res = await callOpenAiWithJsonRecovery(apiKey, LANDING_AI_MODEL, messages, baseUrl);
    if (res.apiError) return { parsed: null, error: res.apiError.message };
    return { parsed: res.parsed, error: res.parsed ? null : "AI trả về JSON không hợp lệ." };
  };
}
