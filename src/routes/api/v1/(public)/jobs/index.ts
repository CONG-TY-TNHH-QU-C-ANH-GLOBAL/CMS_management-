import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listCareersJobsForPublic } from "@/features/careers";
import { isLocale } from "@/features/i18n";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export const Route = createFileRoute("/api/v1/(public)/jobs/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        const category = url.searchParams.get("category") ?? undefined;
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const jobs = await listCareersJobsForPublic({ locale: lang, status: "open", category });
        return corsJson(request, {
          locale: lang,
          jobs: jobs.map((j) => ({
            slug: j.slug,
            position: j.position,
            category: j.category,
            hot: j.hot === 1,
            badge: j.badge,
            tagline: j.tagline,
            title: j.title,
            location: j.location,
            employment_type: j.employment_type,
            salary: j.salary,
            salary_unit: j.salary_unit,
            salary_note: j.salary_note,
            deadline: j.deadline,
            experience: j.experience,
            posted_at: j.posted_at,
          })),
          total: jobs.length,
        });
      },
    },
  },
});
