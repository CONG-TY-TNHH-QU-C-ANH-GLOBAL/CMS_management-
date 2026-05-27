import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getCareersJobForPublic } from "@/features/careers";
import { isLocale } from "@/features/i18n";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export const Route = createFileRoute("/api/v1/(public)/jobs/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const job = await getCareersJobForPublic(params.slug, lang);
        if (!job || job.status !== "open") {
          return corsError(request, 404, `No open job with slug "${params.slug}" in locale "${lang}"`);
        }
        return corsJson(request, {
          locale: lang,
          job: {
            slug: job.slug,
            category: job.category,
            hot: job.hot === 1,
            badge: job.badge,
            tagline: job.tagline,
            title: job.title,
            body_md: job.body_md,
            location: job.location,
            employment_type: job.employment_type,
            salary: job.salary,
            salary_unit: job.salary_unit,
            salary_note: job.salary_note,
            deadline: job.deadline,
            experience: job.experience,
            lead: job.lead,
            responsibilities: parseJson<Record<string, string[]>>(job.responsibilities_json) ?? {},
            requirements: parseJson<string[]>(job.requirements_json) ?? [],
            benefits: parseJson<Array<{ i: string; t: string; d: string }>>(job.benefits_json) ?? [],
            bonuses: parseJson<string[]>(job.bonuses_json) ?? [],
          },
        });
      },
    },
  },
});
