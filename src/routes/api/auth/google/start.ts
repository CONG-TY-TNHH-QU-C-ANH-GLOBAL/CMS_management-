import { createFileRoute } from "@tanstack/react-router";

import { getClientIp, rateLimit } from "@/core/middlewares/rate-limit";
import {
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAuthConfigError,
  buildGoogleAuthUrl,
  generateStateToken,
  isProduction,
} from "@/features/auth";

const STATE_TTL_SECONDS = 600;

// H3 — per-IP rate limit on OAuth initiation. Prevents an attacker from
// spamming this endpoint to set up arbitrary state cookies on a victim's
// browser (state-fixation precursor) or to brute-force the state nonce.
// 10 requests per 60s per IP is generous for a human user clicking
// "Login with Google" while still blocking automated abuse.
const OAUTH_START_RATE_LIMIT = { max: 10, windowSeconds: 60 };

function buildShortLivedCookie(name: string, value: string, prod: boolean): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${STATE_TTL_SECONDS}`,
  ];
  if (prod) parts.push("Secure");
  return parts.join("; ");
}

export const Route = createFileRoute("/api/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await rateLimit("oauth-start", ip, OAUTH_START_RATE_LIMIT);
        if (!limit.allowed) {
          return new Response("Too many login attempts. Try again shortly.", {
            status: 429,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "retry-after": String(Math.max(1, limit.resetAt - Math.floor(Date.now() / 1000))),
            },
          });
        }

        const url = new URL(request.url);
        const redirect = url.searchParams.get("redirect") || "/";

        const state = generateStateToken();

        // Build the Google URL BEFORE setting any state cookie: if the OAuth client is not
        // configured, fail clearly to /login instead of redirecting the browser to Google
        // with an empty client_id (which returns a confusing 400). The value is never logged.
        let authUrl: string;
        try {
          authUrl = buildGoogleAuthUrl(state);
        } catch (err) {
          if (err instanceof OAuthConfigError) {
            console.error(`[auth] OAuth start blocked: ${err.message}`);
            return new Response(null, {
              status: 302,
              headers: { location: "/login?error=oauth_not_configured" },
            });
          }
          throw err;
        }

        const prod = isProduction();
        const headers = new Headers();
        headers.append("set-cookie", buildShortLivedCookie(OAUTH_STATE_COOKIE, state, prod));
        headers.append(
          "set-cookie",
          buildShortLivedCookie(OAUTH_REDIRECT_COOKIE, encodeURIComponent(redirect), prod),
        );
        headers.set("location", authUrl);

        return new Response(null, { status: 302, headers });
      },
    },
  },
});
