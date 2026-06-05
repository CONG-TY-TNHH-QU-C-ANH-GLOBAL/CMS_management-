// Cloudflare Worker bindings — declared in wrangler.jsonc.
// Access via `import { env } from "cloudflare:workers"` (typed as Cloudflare.Env).

import type { RateLimiterDO } from "@/core/middlewares/rate-limiter-do";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      MEDIA: R2Bucket;
      CMS_REV: KVNamespace;
      // Atomic IP rate limiter (see rate-limiter-do.ts). Parameterized with the
      // class so stub.hit(...) is RPC-typed.
      RATE_LIMITER: DurableObjectNamespace<RateLimiterDO>;
      DEFAULT_LOCALE: string;
      BASE_URL: string;
      SUPPORTED_LOCALES: string;
      OAUTH_REDIRECT_BASE: string;
      CORS_ORIGIN: string; // comma-separated allowed origins for /api/v1/*
      CSRF_ALLOWED_ORIGINS?: string; // comma-separated extra origins accepted by requireSafeOrigin() in addition to BASE_URL (preview deploys, custom admin domain). Dev auto-allows localhost/127.0.0.1.
      // Secrets (set via `wrangler secret put` for prod, .dev.vars for local)
      GOOGLE_CLIENT_ID: string;
      GOOGLE_CLIENT_SECRET: string;
      TURNSTILE_SECRET_KEY?: string; // Cloudflare Turnstile for /api/v1/leads
      OPENAI_API_KEY?: string; // Copilot LLM — undefined disables /admin/ai/copilot chat
      OPENAI_BASE_URL?: string; // Override OpenAI endpoint (e.g. Cloudflare AI Gateway proxy URL) — bypass geo-blocked egress
      SESSION_SECRET?: string; // Auth cookie signer (defined elsewhere; declaring for completeness)
      // Landing auto-redeploy (Workstream C3): on careers publish/edit the cron
      // fires a GitHub repository_dispatch to rebuild the landing site so new/
      // changed JD pages are prerendered. Token = fine-grained PAT with
      // "contents: write" (or actions) on the landing repo.
      GITHUB_DISPATCH_TOKEN?: string;
      LANDING_REPO?: string; // "owner/name" of the landing repo
      LANDING_DISPATCH_EVENT_TYPE?: string; // default "cms-content-updated"
    }
  }
}

export {};
