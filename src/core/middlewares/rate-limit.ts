// IP-based rate limit backed by a Durable Object (one instance per scope+ip).
//
// Previously this used Cloudflare KV with a read-then-write, which is NOT
// atomic: concurrent requests from one IP all read the same count and wrote
// count+1, so a burst undercounted and bypassed the cap (KV is also eventually
// consistent, widening that race). The DO serializes calls on a single thread,
// so its read-modify-write is atomic. See rate-limiter-do.ts.

import { env } from "cloudflare:workers";
import "@/core/db/env";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  scope: string,
  ip: string,
  options: { max: number; windowSeconds: number },
): Promise<RateLimitResult> {
  try {
    const id = env.RATE_LIMITER.idFromName(`${scope}:${ip}`);
    const stub = env.RATE_LIMITER.get(id);
    return await stub.hit(options.max, options.windowSeconds);
  } catch (err) {
    // Fail OPEN: a Durable Object hiccup must not take down public lead /
    // applicant submission. These endpoints are also guarded by Turnstile, so
    // a brief loss of the secondary IP throttle is an acceptable trade-off.
    console.warn(`[rateLimit] DO call failed for ${scope}:${ip}; allowing request`, err);
    return {
      allowed: true,
      remaining: options.max,
      resetAt: Math.floor(Date.now() / 1000) + options.windowSeconds,
    };
  }
}

/**
 * Verify Cloudflare Turnstile token. Returns true if valid (or dev bypass).
 * Set TURNSTILE_SECRET_KEY in production secrets. Empty key = dev bypass.
 */
export async function verifyTurnstile(token: string, ip?: string | null): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Dev mode — accept any non-empty token (incl. "DEV_BYPASS")
    return token.length > 0;
  }
  const body = new URLSearchParams({
    secret,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}
