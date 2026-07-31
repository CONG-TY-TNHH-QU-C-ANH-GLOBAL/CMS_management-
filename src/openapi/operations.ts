// OpenAPI assembly helpers — the shared MECHANICS of declaring an operation.
//
// These own transport-level semantics that are genuinely identical across endpoints: the
// bounded `{ error }` envelope, the JSON response wrapper, and the platform locale parameter.
// Sonar measured the cost of not having them: the error-envelope block appeared 49 times in
// paths.ts and the `lang` query object 11 times.
//
// WHAT THIS FILE MUST NEVER OWN
//
//   - Request or response SCHEMAS. Those stay in features/<f>/<f>.schemas.ts. `jsonResponse`
//     takes a schema and passes the SAME OBJECT REFERENCE through, so
//     scripts/check-openapi-drift.ts still compares `===` against the canonical export. Two
//     schemas are never merged here because their shapes look alike — only the wrapper is
//     shared, never the contract inside it.
//   - Route identity, classification or trust metadata. That is route-classification.ts.
//
// The generic parameter on `jsonResponse` is what preserves drift detection: the returned
// object's `schema` is typed as the exact schema passed in, not widened to ZodTypeAny, so the
// identity check remains a compile-time-visible reference rather than a structural comparison.

import { z } from "zod";

/** The bounded public error body. Every non-2xx JSON response in the document is this shape —
 *  a raw provider or database message must never reach a public consumer. */
export const errorBodySchema = z.object({ error: z.string() });

/** The platform locale parameter. One definition, so a future locale rollout is a single edit
 *  and cannot drift per endpoint (enforced by the locale test in public-surface.test.ts). */
export const LANG_QUERY = z.object({
  lang: z.enum(["en", "vi", "zh"]).optional(),
});

/** Locale parameter plus the free-form `scope` filter (FAQs). */
export const LANG_SCOPE_QUERY = z.object({
  lang: z.enum(["en", "vi", "zh"]).optional(),
  scope: z.string().optional(),
});

/** A slug path parameter. */
export const SLUG_PARAM = z.object({ slug: z.string() });

/** A JSON response entry. The schema reference is preserved exactly (see the header note). */
export function jsonResponse<S>(description: string, schema: S) {
  return { description, content: { "application/json": { schema } } } as const;
}

/** A bounded `{ error }` response entry. */
export function errorResponse(description: string) {
  return jsonResponse(description, errorBodySchema);
}

/** A JSON request body entry. */
export function jsonBody<S>(schema: S) {
  return { content: { "application/json": { schema } } } as const;
}

// ── Reused error responses ──────────────────────────────────────────────────────────────────
// Named because the WORDING is the contract a consumer reads, not because the shape repeats.

export const BAD_LANG = errorResponse("Invalid `lang` query parameter");
export const TURNSTILE_FAILED = errorResponse("Turnstile verification failed");
export const MALFORMED_JSON = errorResponse("Malformed JSON or field validation failure");

/** Rate-limit response. The numbers are per-endpoint policy, so they are a parameter rather
 *  than a shared constant — collapsing them would hide that leads allow 10/h and applicants 5/h. */
export function rateLimited(max: number, per = "hour"): ReturnType<typeof errorResponse> {
  return errorResponse(`Rate limit exceeded (${max} per IP per ${per})`);
}
