// Workstream C3 — landing auto-redeploy.
//
// Each JD has its own prerendered /careers/:slug page on the (separately
// deployed) landing site. When HR publishes/edits/closes a job we must rebuild
// the landing so the new/changed page is prerendered + the sitemap updates.
//
// Coalescing: instead of dispatching a build on every edit (deploy storm), a
// careers mutation just sets a "dirty" flag in KV. The existing 1-minute Cron
// flushes it — trailing-edge coalescing means any number of edits within a
// minute collapse into AT MOST ONE repository_dispatch, and the build always
// fetches fresh CMS data so it captures every edit. GitHub Actions
// `concurrency: cancel-in-progress` cancels a superseded build on top of that.

import { env } from "cloudflare:workers";

const DIRTY_KEY = "landing_rebuild_dirty";

/** Mark that the landing site needs a rebuild. Best-effort, never throws. */
export async function markLandingRebuildNeeded(reason: string): Promise<void> {
  try {
    await env.CMS_REV.put(DIRTY_KEY, JSON.stringify({ ts: Date.now(), reason }));
  } catch (err) {
    console.error("[landing-rebuild] mark failed", err);
  }
}

/** Cron flush: if a rebuild is pending, fire a GitHub repository_dispatch and
 *  clear the flag. On dispatch failure the flag is KEPT so the next cron tick
 *  retries. Best-effort, never throws. Returns whether a dispatch was sent. */
export async function flushLandingRebuild(): Promise<boolean> {
  try {
    const flag = await env.CMS_REV.get(DIRTY_KEY);
    if (!flag) return false;

    const token = env.GITHUB_DISPATCH_TOKEN;
    const repo = env.LANDING_REPO; // "owner/name"
    const eventType = env.LANDING_DISPATCH_EVENT_TYPE || "cms-content-updated";
    if (!token || !repo) {
      // Not configured — clear the flag so we don't log every minute forever.
      console.warn("[landing-rebuild] GITHUB_DISPATCH_TOKEN/LANDING_REPO not set — skipping + clearing flag");
      await env.CMS_REV.delete(DIRTY_KEY);
      return false;
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "thg-cms-worker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: { source: "cms", reason: flag },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`[landing-rebuild] dispatch ${res.status}: ${t.slice(0, 200)} — keeping flag for retry`);
      return false; // keep flag → retry next tick
    }
    await env.CMS_REV.delete(DIRTY_KEY);
    console.log(`[landing-rebuild] dispatched ${eventType} → ${repo}`);
    return true;
  } catch (err) {
    console.error("[landing-rebuild] flush failed", err);
    return false;
  }
}
