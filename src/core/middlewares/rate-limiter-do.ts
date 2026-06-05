// Durable Object backing IP rate limiting.
//
// Each (scope, ip) pair maps to ONE instance via idFromName, and a Durable
// Object processes its calls serially on a single thread — so the
// read-modify-write in hit() cannot interleave. This is the atomic counter the
// prior KV implementation could not provide: with KV, concurrent requests from
// one IP all read the same `count` and wrote `count+1`, so a burst undercounted
// and slipped past the cap (KV is also only eventually consistent, widening the
// window). See rate-limit.ts for the caller.

import { DurableObject } from "cloudflare:workers";

interface Bucket {
  count: number;
  resetAt: number; // unix seconds — when the current window rolls over
}

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiterDO extends DurableObject {
  /** Register one request against this (scope, ip)'s window and return the
   *  verdict. Atomic by construction — the DO serializes concurrent calls. */
  async hit(max: number, windowSeconds: number): Promise<RateLimitVerdict> {
    const now = Math.floor(Date.now() / 1000);
    let bucket = await this.ctx.storage.get<Bucket>("bucket");
    if (!bucket || bucket.resetAt <= now) {
      // First hit, or the previous window has expired → start a fresh window.
      bucket = { count: 0, resetAt: now + windowSeconds };
    }
    bucket.count += 1;
    await this.ctx.storage.put("bucket", bucket);
    // Self-evict idle IPs: an alarm a little past the window's end wipes this
    // instance's storage so we don't retain a row per IP indefinitely. Each
    // hit pushes the alarm out, so it only fires once the IP goes quiet.
    await this.ctx.storage.setAlarm((bucket.resetAt + 5) * 1000);
    return {
      allowed: bucket.count <= max,
      remaining: Math.max(0, max - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  async alarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const bucket = await this.ctx.storage.get<Bucket>("bucket");
    // Only clean up if the window really has lapsed (a hit may have landed
    // between the alarm being set and it firing, restarting the window).
    if (!bucket || bucket.resetAt <= now) {
      await this.ctx.storage.deleteAll();
    }
  }
}
