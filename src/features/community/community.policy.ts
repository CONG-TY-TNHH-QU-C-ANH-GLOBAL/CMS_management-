// Community Hub SEO / moderation policy — single source of truth.
//
// Indexing rule (Business Plan §4): Google may only index community content
// that is published AND "Verified by THG" AND carries a THG expert answer.
// Everything else is noindex on landing and absent from sitemap/prerender.

/** Strict indexing gate: published AND verified AND non-empty expert answer. */
export function isIndexable(row: {
  status: string;
  verified: number;
  expert_answer: string | null;
}): boolean {
  return (
    row.status === "published" &&
    row.verified === 1 &&
    Boolean(row.expert_answer?.trim())
  );
}

/** Minimum body length for a review to be considered non-thin enough to index.
 *  Above the 20-char submit floor so one-liner reviews stay out of SEO even
 *  once an operator verifies them (thin-content prevention). */
export const MIN_INDEXABLE_REVIEW_BODY = 60;

/** Strict indexing gate for a verified review: published AND "Verified by THG"
 *  AND still active (not withdrawn) AND carrying meaningful, non-thin content.
 *  Landing derives its noindex rule from this — everything else is noindex and
 *  absent from sitemap/prerender. */
export function isReviewIndexable(row: {
  status: string;
  verified: number;
  title: string;
  body: string;
  withdrawn_at?: number | null;
}): boolean {
  return (
    row.status === "published" &&
    row.verified === 1 &&
    !row.withdrawn_at &&
    Boolean(row.title.trim()) &&
    row.body.trim().length >= MIN_INDEXABLE_REVIEW_BODY
  );
}

/** Invariant: "Verified by THG" is a quality stamp on an expert answer —
 *  it must never be set while no answer exists. */
export function assertExpertAnswerInvariant(
  expertAnswer: string | null,
  verified: boolean,
): void {
  if (verified && !expertAnswer?.trim()) {
    throw new Error(
      "Không thể bật 'Verified by THG' khi chưa có câu trả lời chuyên gia",
    );
  }
}
