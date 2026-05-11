// CORS helpers for /api/v1/* REST endpoints.
// Public consumers (THG_landingpage) need cross-origin headers.
// Admin internal RPC routes (lib/api/*) don't need this — same-origin.

import { env } from "cloudflare:workers";
import "@/core/db/env";

const DEFAULT_CACHE = "public, s-maxage=300, stale-while-revalidate=900";

function getAllowedOrigin(requestOrigin: string | null): string {
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
