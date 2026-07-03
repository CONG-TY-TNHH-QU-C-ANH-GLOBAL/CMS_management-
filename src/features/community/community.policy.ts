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
