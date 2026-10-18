// Job-level facts a legacy en/zh row must take from its VI source.
//
// The legacy en/zh fallback (translation not yet reviewed) serves the old
// locale row for its text, but that row's dates and contract type are often
// stale or null — which left Google's JobPosting markup without
// validThrough/employmentType on /en and /zh job pages. The VI source owns
// these, as it already owns status/category.

import type { CareersJobRow } from "./careers.service";

export type ViJobFacts = Pick<
  CareersJobRow,
  "status" | "category" | "deadline" | "posted_at" | "employment_type"
>;

export function overlayViJobFacts(legacy: CareersJobRow, vi: ViJobFacts): CareersJobRow {
  return {
    ...legacy,
    status: vi.status,
    category: vi.category,
    deadline: vi.deadline,
    posted_at: vi.posted_at,
    // Keep a localized contract label ("3-6 month Internship") when the legacy
    // row has one; fall back to VI only when it's missing.
    employment_type: legacy.employment_type || vi.employment_type,
  };
}
