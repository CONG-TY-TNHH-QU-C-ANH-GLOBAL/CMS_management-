import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { isLocale } from "@/features/i18n";
import { getPolicy, type PolicyTextBlock } from "@/features/policies";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export const Route = createFileRoute("/api/v1/(public)/policies/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const policy = await getPolicy(params.slug, lang);
        if (!policy) return corsError(request, 404, `No policy with slug "${params.slug}" in locale "${lang}"`);

        return corsJson(request, {
          locale: lang,
          policy: {
            slug: policy.slug,
            title: policy.title,
            icon: policy.icon,
            mode: policy.mode,
            body_md: policy.body_md,
            image_list: parseJson<string[]>(policy.image_list_json) ?? [],
            text_blocks: parseJson<PolicyTextBlock[]>(policy.text_blocks_json) ?? [],
            summary: policy.summary,
            position: policy.position,
            updated_at: policy.updated_at,
            version: policy.version,
          },
        });
      },
    },
  },
});
