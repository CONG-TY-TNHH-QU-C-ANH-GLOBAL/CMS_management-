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
      // Blog Auto-Bot images. Optional — a campaign's image_mode='stock' fetches
      // royalty-free photos from Pexels (primary) or Unsplash (fallback) and
      // downloads them into R2. Undefined disables stock images (article still
      // generates, just without a photo). image_mode='ai_generate' uses
      // OPENAI_API_KEY instead. Set via `wrangler secret put PEXELS_API_KEY`.
      PEXELS_API_KEY?: string;
      UNSPLASH_ACCESS_KEY?: string;
      SESSION_SECRET?: string; // Auth cookie signer (defined elsewhere; declaring for completeness)
      // Landing auto-redeploy (Workstream C3): on careers publish/edit the cron
      // fires a GitHub repository_dispatch to rebuild the landing site so new/
      // changed JD pages are prerendered. Token = fine-grained PAT with
      // "contents: write" (or actions) on the landing repo.
      GITHUB_DISPATCH_TOKEN?: string;
      LANDING_REPO?: string; // "owner/name" of the landing repo
      LANDING_DISPATCH_EVENT_TYPE?: string; // default "cms-content-updated"
      // CMS -> CRM website lead projection. The URL is a non-secret Worker
      // variable; the shared HMAC key is a Worker secret.
      CRM_LEAD_SYNC_URL?: string;
      CMS_CRM_SYNC_KEY?: string;
      CRM_LEGACY_LEAD_BACKFILL_ENABLED?: string;
      // marketing.thgfulfill.com -> CMS agent ingest (POST /api/v1/agent/events).
      // Shared bearer token for the marketing tool's writer agent. Undefined
      // disables the route (503), which is the fail-closed default — an
      // unconfigured deployment refuses the call rather than accepting any.
      MARKETING_AGENT_TOKEN?: string;
      MARKETING_HUB_INGEST_ENABLED?: string;
      MARKETING_HUB_CALLBACKS_ENABLED?: string;
      MARKETING_HUB_SIGNING_SECRET?: string;
      MARKETING_HUB_CALLBACK_URL?: string;
      MARKETING_HUB_PUBLIC_ORIGIN?: string;
      MARKETING_HUB_PREVIEW_SECRET?: string;
      // Uploaded campaign landing pages. LANDING_HOST is the separate origin that serves them
      // (src/features/campaigns/landing/landing.host.ts); LANDING_ORIGIN overrides the public
      // URL built from it (local dev). TURNSTILE_SITE_KEY is the PUBLIC Turnstile widget key
      // thg-lead.js renders; without it the form sends the DEV_BYPASS token.
      LANDING_HOST?: string;
      LANDING_ORIGIN?: string;
      TURNSTILE_SITE_KEY?: string;
      // Claude (Anthropic API) for the landing AI format + audit steps. Secret; undefined skips
      // the AI steps (deterministic normalization and checks still run). LANDING_AI_MODEL
      // overrides the model (default claude-opus-5-5).
      ANTHROPIC_API_KEY?: string;
      LANDING_AI_MODEL?: string;
      // DeepSeek (OpenAI-compatible chat completions) used as the fallback when Claude is not
      // configured or fails. Secret; undefined leaves the chain Claude-only.
      // LANDING_AI_MODEL_DEEPSEEK overrides the model (default deepseek-flash).
      DEEPSEEK_API_KEY?: string;
      LANDING_AI_MODEL_DEEPSEEK?: string;
      LANDING_AI_BASE_URL_DEEPSEEK?: string;
    }
  }
}

export {};
