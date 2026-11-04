import { createFileRoute } from "@tanstack/react-router";

import { getClientIp, rateLimit } from "@/core/middlewares/rate-limit";
import {
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  isProduction,
  issueSession,
  upsertGoogleUser,
} from "@/features/auth";
import { buildCookie, readCookie } from "@/features/auth/auth.cookies";
import { createLoginDiagnostic } from "@/features/auth/auth.diagnostics";

// H3 — per-IP rate limit on OAuth callback. Same envelope as the start
// endpoint: 10 req/60s/IP. This bounds replay attempts and code-exchange
// brute force; legitimate users only hit this endpoint once per login.
const OAUTH_CALLBACK_RATE_LIMIT = { max: 10, windowSeconds: 60 };

function errorRedirect(reason: string): Response {
  const params = new URLSearchParams({ error: reason });
  return new Response(null, {
    status: 302,
    headers: { location: `/login?${params.toString()}` },
  });
}

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await rateLimit("oauth-callback", ip, OAUTH_CALLBACK_RATE_LIMIT);
        if (!limit.allowed) {
          return new Response("Too many callback attempts. Try again shortly.", {
            status: 429,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "retry-after": String(Math.max(1, limit.resetAt - Math.floor(Date.now() / 1000))),
            },
          });
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) return errorRedirect(error);
        if (!code || !state) return errorRedirect("missing_code_or_state");

        const cookieHeader = request.headers.get("cookie");
        const expectedState = readCookie(cookieHeader, OAUTH_STATE_COOKIE, isProduction());
        if (!expectedState || expectedState !== state) {
          return errorRedirect("invalid_state");
        }

        const redirectRaw = readCookie(cookieHeader, OAUTH_REDIRECT_COOKIE, isProduction());
        const redirectTo = redirectRaw ? decodeURIComponent(redirectRaw) : "/";
        const diagnostic = createLoginDiagnostic();

        let userInfo;
        let tokens;
        try {
          tokens = await exchangeCodeForTokens(code);
          userInfo = await fetchGoogleUserInfo(tokens.access_token);
        } catch (err) {
          diagnostic.failed("token_exchange_failed");
          console.error("Google OAuth error:", err);
          return errorRedirect("token_exchange_failed");
        }

        await diagnostic.provider(userInfo.email, userInfo.email_verified);
        if (!userInfo.email_verified) {
          diagnostic.failed("email_not_verified");
          return errorRedirect("email_not_verified");
        }

        // Compare only: keep the original identity and never let this probe reject a login.
        if (diagnostic.enabled) {
          try {
            const uncached = await fetchGoogleUserInfo(tokens.access_token, "no-store");
            await diagnostic.provider(uncached.email, uncached.email_verified, true);
          } catch {
            diagnostic.unavailable();
          }
        }

        let user;
        try {
          user = await upsertGoogleUser(userInfo);
          diagnostic.mapped(
            user.id,
            user.role,
            user.email.toLowerCase().trim() === userInfo.email.toLowerCase().trim(),
          );
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === "EMAIL_NOT_INVITED") {
            diagnostic.failed("email_not_invited");
            return errorRedirect("email_not_invited");
          }
          if (code === "USER_DISABLED") {
            diagnostic.failed("user_disabled");
            return errorRedirect("user_disabled");
          }
          diagnostic.failed("user_mapping_failed");
          throw err;
        }
        let sessionCookie: string;
        try {
          sessionCookie = await issueSession(user);
          diagnostic.issued(user.id);
        } catch (err) {
          diagnostic.failed("session_issue_failed");
          // issueSession() throws SESSION_CLEANUP_FAILED if it cannot purge
          // prior sessions — fail-closed for admin auth (see comment in
          // issueSession). Surface as a friendly redirect instead of a 500.
          if ((err as { code?: string }).code === "SESSION_CLEANUP_FAILED") {
            console.error("issueSession cleanup failed:", err);
            return errorRedirect("session_init_failed");
          }
          throw err;
        }

        const prod = isProduction();
        const headers = new Headers();
        if (diagnostic.correlationId) headers.set("x-thg-auth-trace", diagnostic.correlationId);
        headers.append("set-cookie", sessionCookie);
        headers.append("set-cookie", buildCookie(OAUTH_STATE_COOKIE, "", 0, prod));
        headers.append("set-cookie", buildCookie(OAUTH_REDIRECT_COOKIE, "", 0, prod));
        headers.set("location", redirectTo.startsWith("/") ? redirectTo : "/");

        return new Response(null, { status: 302, headers });
      },
    },
  },
});
