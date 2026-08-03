// CORS helpers for /api/v1/* REST endpoints.
// Public consumers (THG_landingpage) need cross-origin headers.
// Admin internal RPC routes (lib/api/*) don't need this — same-origin.

import { env } from "cloudflare:workers";
import "@/core/db/env";
import { isAllowedMutationOrigin, isLocalhostOrigin, parseOriginAllowList } from "./cors-origin";

const DEFAULT_CACHE = "public, s-maxage=300, stale-while-revalidate=900";

// The landing SEO prerender (THG_landingpage/scripts/prerender.mjs) drives a
// headless browser served from http://127.0.0.1:<random-port>; its in-page
// React then fetches this public CMS API, so the browser's Origin is a
// localhost preview origin that no fixed allowlist can enumerate. Echo those
// back so the prerendered shells get real content + JSON-LD. Safe here because
// (a) this helper is used ONLY by (public) read endpoints — admin is
// same-origin, (b) a localhost Origin can't be forged by a remote page (the
// browser sets it), and (c) no route sends Access-Control-Allow-Credentials.
function getAllowedOrigin(requestOrigin: string | null): string {
  if (isLocalhostOrigin(requestOrigin)) return requestOrigin as string;
  const list = (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (list.length === 0) return "*";
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0];
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = getAllowedOrigin(request.headers.get("origin"));
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, CF-Turnstile-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function corsJson(
  request: Request,
  data: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v as string);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", DEFAULT_CACHE);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function corsError(
  request: Request,
  status: number,
  message: string,
): Response {
  return corsJson(request, { error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function corsOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

// ── Public browser mutation boundary (CMS-P1) ───────────────────────────────
//
// WHY A SECOND CONCEPT IN THIS FILE. Everything above builds RESPONSE headers:
// it decides whether a browser may EXPOSE a cross-origin response. That is not
// a mutation boundary. `getAllowedOrigin` returns `list[0]` for an unlisted
// origin and the handler still runs, so today an unlisted page's POST reaches
// D1/R2 and only the response is withheld from it. Worse, two public writes are
// CORS-SIMPLE (`same-issue` sends `Accept` only; `applicant-cv` sends
// `multipart/form-data`), so the browser never preflights them — preflight can
// never be the boundary. The wrapper below rejects on the ACTUAL request,
// before any side effect, which is the only place the decision can be enforced.
//
// It is NOT authentication. It constrains browsers, which set Origin
// unforgeably; it does not constrain a client that writes its own headers.
// Rate limiting, Turnstile and owner tokens remain the controls for that.

/** 403 when this request's browser origin may not mutate, otherwise null.
 *
 *  Built with `corsError`, so the refusal still carries CORS headers and `Cache-Control:
 *  no-store` — a refused caller gets a clean, uncached error rather than an opaque failure.
 *  The body is the bounded `{ error }` envelope every public route already returns; no callers
 *  parse it (both landing clients discard error bodies by policy). */
export function checkPublicMutationOrigin(request: Request): Response | null {
  const allowed = isAllowedMutationOrigin(
    request.headers.get("origin"),
    parseOriginAllowList(env.CORS_ORIGIN),
    // Vite tree-shakes the dev branch out of production bundles, exactly as csrf.ts does.
    { allowLoopback: !import.meta.env.PROD },
  );
  if (allowed) return null;
  return corsError(request, 403, "Nguồn gọi không được phép thực hiện thao tác này.");
}

/** Wrappers this module created, by identity.
 *
 *  ATTESTATION, NOT ENFORCEMENT. Runtime refusal is done by the wrapper closure below; this
 *  registry exists only so the public-surface gate can prove which route handlers were wrapped.
 *
 *  A module-private WeakSet, deliberately not a `Symbol.for` brand. A global symbol is
 *  discoverable by key from anywhere — `fn[Symbol.for("…")] = true` on an unwrapped function
 *  would have satisfied the gate without the check ever running, which is exactly the forgery
 *  the gate exists to prevent. Membership here can only be granted by the line below, inside the
 *  same call that installs the check, and nothing is exported that could add to it. Weak keys
 *  mean a discarded handler is still collectable. */
const BOUNDARY_WRAPPERS = new WeakSet<object>();

/** Wrap a public mutation handler so the origin check runs BEFORE it, and record the wrapper so
 *  the route-surface gate can attest the wiring.
 *
 *  A disallowed origin means the inner handler is never invoked at all — so no rate-limit
 *  accounting, no body read, no Turnstile call, no owner-token lookup, no D1/R2 write and no
 *  Telegram dispatch can occur. That is a structural property of wrapping, not a convention a
 *  future edit inside the handler could quietly break. */
export function withMutationOriginBoundary<Ctx extends { request: Request }>(
  handler: (ctx: Ctx) => Response | Promise<Response>,
): (ctx: Ctx) => Promise<Response> {
  const guarded = async (ctx: Ctx): Promise<Response> => {
    const denied = checkPublicMutationOrigin(ctx.request);
    if (denied) return denied;
    return handler(ctx);
  };
  BOUNDARY_WRAPPERS.add(guarded);
  return guarded;
}

/** Whether a handler is a wrapper this module produced. Used by the public-surface gate to
 *  verify coverage against the route classification.
 *
 *  True only for the exact function object `withMutationOriginBoundary` returned. A plain
 *  function, a plain object, and a value carrying any property or symbol are all false — there
 *  is no key to imitate. */
export function hasMutationOriginBoundary(handler: unknown): boolean {
  if (typeof handler !== "function") return false;
  return BOUNDARY_WRAPPERS.has(handler);
}
