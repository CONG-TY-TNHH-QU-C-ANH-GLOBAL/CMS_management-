// Public response schemas for /api/v1 endpoints under the careers feature.
//
// Same discipline as other *.schemas.ts in Phase D2: extracted shapes of
// current runtime payloads, no openapi imports here, no normalization or
// refactor.
//
// Special note for the detail endpoint: four JSON-string DB columns
// (responsibilities_json / requirements_json / benefits_json / bonuses_json)
// are parsed by the handler with `?? {}` / `?? []` fallback. In the wire
// shape these fields are therefore NEVER null — they always materialize as
// at least an empty container. The Zod schemas below reflect that
// resolved-and-fallback shape, not the raw nullable DB columns.
//
// The handler also coerces `hot: number → boolean` via `j.hot === 1`. The
// schema models the wire shape (boolean), not the DB shape (integer).

import { z } from "zod";

const localeSchema = z.enum(["en", "vi", "zh"]);

// Summary projection used by GET /api/v1/jobs?lang=&category=
// (jobs/index.ts:25-40). 14 fields. NO body_md / lead / JSON fields.
// Title/slug/position required (CareersJobRow base type); most string
// fields nullable; `hot` already boolean here (handler-side coercion).
const jobSummarySchema = z.object({
  slug: z.string(),
  position: z.number().int(),
  category: z.string().nullable(),
  hot: z.boolean(),
  badge: z.string().nullable(),
  tagline: z.string().nullable(),
  title: z.string(),
  location: z.string().nullable(),
  employment_type: z.string().nullable(),
  salary: z.string().nullable(),
  salary_unit: z.string().nullable(),
  salary_note: z.string().nullable(),
  deadline: z.string().nullable(),
  experience: z.string().nullable(),
  posted_at: z.number().int(), // epoch seconds — for JobPosting datePosted (Google for Jobs)
});

// /api/v1/jobs?lang=&category= response body.
// Built in jobs/index.ts:23 as `{ locale, jobs, total }`. Status=open only;
// handler filters drafts/archived server-side.
export const jobsResponseSchema = z.object({
  locale: localeSchema,
  jobs: z.array(jobSummarySchema),
  total: z.number().int(),
});

export type JobsResponse = z.infer<typeof jobsResponseSchema>;

// Benefit item shape inside the parsed benefits_json column. Matches the
// frontend's jobBenefitSchema (THG_landingpage/src/lib/cmsSchemas.ts:343)
// and the handler's parseJson<Array<{i,t,d}>> declaration
// (jobs/$slug.ts:45). Fields are abbreviated by convention — `i`=icon
// name, `t`=title, `d`=description.
const jobBenefitSchema = z.object({
  i: z.string(),
  t: z.string(),
  d: z.string(),
});

// Detail projection used by GET /api/v1/jobs/$slug?lang=
// (jobs/$slug.ts:27-47). Adds body_md / lead and the four
// parsed-from-JSON fields. Each JSON field is documented inline:
//
//   responsibilities  ← responsibilities_json parsed as
//                       Record<string, string[]>; fallback {}
//   requirements      ← requirements_json parsed as string[]; fallback []
//   benefits          ← benefits_json parsed as Array<{i,t,d}>; fallback []
//   bonuses           ← bonuses_json parsed as string[]; fallback []
//
// All four are ALWAYS PRESENT in the wire shape (never null).
const jobDetailSchema = z.object({
  slug: z.string(),
  category: z.string().nullable(),
  hot: z.boolean(),
  badge: z.string().nullable(),
  tagline: z.string().nullable(),
  title: z.string(),
  body_md: z.string(),
  location: z.string().nullable(),
  employment_type: z.string().nullable(),
  salary: z.string().nullable(),
  salary_unit: z.string().nullable(),
  salary_note: z.string().nullable(),
  deadline: z.string().nullable(),
  experience: z.string().nullable(),
  posted_at: z.number().int(), // epoch seconds — for JobPosting datePosted (Google for Jobs)
  lead: z.string().nullable(),
  responsibilities: z.record(z.string(), z.array(z.string())),
  requirements: z.array(z.string()),
  benefits: z.array(jobBenefitSchema),
  bonuses: z.array(z.string()),
});

// /api/v1/jobs/$slug?lang= response body.
// Built in jobs/$slug.ts:25 as `{ locale, job: { ...projection } }`.
export const jobResponseSchema = z.object({
  locale: localeSchema,
  job: jobDetailSchema,
});

export type JobResponse = z.infer<typeof jobResponseSchema>;
