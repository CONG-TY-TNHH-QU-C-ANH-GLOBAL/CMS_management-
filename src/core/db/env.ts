// Cloudflare Worker bindings — declared in wrangler.jsonc.
// Access via `import { env } from "cloudflare:workers"` (typed as Cloudflare.Env).

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      MEDIA: R2Bucket;
      CMS_REV: KVNamespace;
      DEFAULT_LOCALE: string;
      BASE_URL: string;
      SUPPORTED_LOCALES: string;
      OAUTH_REDIRECT_BASE: string;
      CORS_ORIGIN: string; // comma-separated allowed origins for /api/v1/*
      // Secrets (set via `wrangler secret put` for prod, .dev.vars for local)
      GOOGLE_CLIENT_ID: string;
      GOOGLE_CLIENT_SECRET: string;
      TURNSTILE_SECRET_KEY?: string; // Cloudflare Turnstile for /api/v1/leads
    }
  }
}

export {};
