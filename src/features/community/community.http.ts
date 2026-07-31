// Shared request handlers for the public community routes (Q&A + Reviews). The
// two feature route trees have identical plumbing — rate-limit, JSON parsing,
// Turnstile, the generic-404 withdraw flow — so it lives here once. Each route
// file keeps its own path, schema, rate-limit key and messages (passed in), so
// behavior stays per-feature and explicit.

import { z } from "zod";

import { corsError, corsJson } from "@/core/middlewares/cors";
import { getClientIp, rateLimit, verifyTurnstile } from "@/core/middlewares/rate-limit";
import { communityWithdrawRequestSchema } from "./community.schemas";

/** GET list: optional `?category=` slug filter → `{ [key]: rows.map(mapper) }`. */
export async function handleCommunityList<Row, Out>(
  request: Request,
  key: string,
  list: (filter: { categorySlug?: string }) => Promise<Row[]>,
  mapper: (row: Row) => Out,
): Promise<Response> {
  const category = new URL(request.url).searchParams.get("category") ?? undefined;
  const rows = await list({ categorySlug: category });
  return corsJson(request, { [key]: rows.map(mapper) });
}

/** GET detail by slug → `{ [key]: mapper(row) }`, or a generic 404. */
export async function handleCommunityDetail<Row, Out>(
  request: Request,
  slug: string,
  fetchRow: (slug: string) => Promise<Row | null>,
  mapper: (row: Row) => Out,
  key: string,
  notFoundMessage: string,
): Promise<Response> {
  const row = await fetchRow(slug);
  if (!row) return corsError(request, 404, notFoundMessage);
  return corsJson(request, { [key]: mapper(row) });
}

/** Public submit guard: rate-limit (5/hr), JSON parse, schema validation and
 *  Turnstile. Returns the client IP + validated data, or a Response to return
 *  directly. The caller owns persistence + the success response. */
export async function guardCommunitySubmit<D extends { turnstile_token: string }>(
  request: Request,
  rateLimitKey: string,
  schema: z.ZodType<D>,
): Promise<{ ip: string; data: D } | Response> {
  const ip = getClientIp(request);
  const rl = await rateLimit(rateLimitKey, ip, { max: 5, windowSeconds: 3600 });
  if (!rl.allowed) return corsError(request, 429, "Quá nhiều yêu cầu. Thử lại sau 1 giờ.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return corsError(request, 400, "Body phải là JSON hợp lệ");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return corsError(request, 400, first?.message ?? "Validation failed");
  }

  const ok = await verifyTurnstile(parsed.data.turnstile_token, ip);
  if (!ok) return corsError(request, 403, "Turnstile verification failed");

  return { ip, data: parsed.data };
}

/** Public withdraw: rate-limit (20/hr brute-force cap), parse, verify ownership
 *  via `withdraw`. Generic 404 either way — never reveal whether the slug
 *  exists or the token was merely wrong (no ownership enumeration). */
export async function handleCommunityWithdraw(
  request: Request,
  slug: string,
  rateLimitKey: string,
  withdraw: (slug: string, ownerToken: string) => Promise<boolean>,
  notFoundMessage: string,
): Promise<Response> {
  const ip = getClientIp(request);
  const rl = await rateLimit(rateLimitKey, ip, { max: 20, windowSeconds: 3600 });
  if (!rl.allowed) return corsError(request, 429, "Quá nhiều yêu cầu. Thử lại sau 1 giờ.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return corsError(request, 400, "Body phải là JSON hợp lệ");
  }

  const parsed = communityWithdrawRequestSchema.safeParse(body);
  if (!parsed.success) return corsError(request, 400, "Thiếu ownerToken");

  const ok = await withdraw(slug, parsed.data.ownerToken);
  if (!ok) return corsError(request, 404, notFoundMessage);
  return corsJson(request, { ok: true, withdrawn: true }, { headers: { "Cache-Control": "no-store" } });
}
