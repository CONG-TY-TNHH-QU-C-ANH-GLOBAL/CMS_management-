// IP-based rate limit using Cloudflare KV.
// Bucket key: `ratelimit:<scope>:<ip>`. Counter increments per request, expires after window.

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
  const key = `ratelimit:${scope}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + options.windowSeconds;

  const raw = await env.CMS_REV.get(key);
  let count = 0;
  let bucketResetAt = resetAt;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { count: number; resetAt: number };
      if (parsed.resetAt > now) {
        count = parsed.count;
        bucketResetAt = parsed.resetAt;
      }
    } catch {
      // ignore corrupt value
    }
  }

  count += 1;
  const allowed = count <= options.max;
  const ttl = Math.max(1, bucketResetAt - now);
  await env.CMS_REV.put(key, JSON.stringify({ count, resetAt: bucketResetAt }), {
    expirationTtl: ttl,
  });

  return { allowed, remaining: Math.max(0, options.max - count), resetAt: bucketResetAt };
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
