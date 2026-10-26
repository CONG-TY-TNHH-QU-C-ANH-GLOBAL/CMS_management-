// Provider chain for the landing AI steps: try Claude first, fall back to
// DeepSeek (or any other JsonAiCall) when the first one returns no parsed JSON.
//
// Rules kept from the single-provider version:
//   - callers still fall back to the deterministic path when every provider fails;
//   - the returned reason never contains an API key (each provider already
//     guarantees that) and names the provider that failed, so the editor report
//     says which key to look at.

import type { JsonAiCall, JsonAiResult } from "./landing.ai";

export interface NamedAi {
  name: string;
  call: JsonAiCall;
}

/**
 * Run providers in order and return the first parsed result. When all fail, the
 * error is every provider's reason joined, prefixed with the provider name.
 */
export function createAiChain(providers: NamedAi[]): JsonAiCall {
  return async (request) => {
    const errors: string[] = [];
    let lastUsage: JsonAiResult["usage"] = null;
    for (const provider of providers) {
      const result = await provider.call(request);
      if (result.parsed) return result;
      if (result.usage) lastUsage = result.usage;
      errors.push(`${provider.name}: ${result.error ?? "không trả về JSON."}`);
    }
    return {
      parsed: null,
      error: errors.join(" ") || "Không có nhà cung cấp AI nào được cấu hình.",
      usage: lastUsage,
    };
  };
}
