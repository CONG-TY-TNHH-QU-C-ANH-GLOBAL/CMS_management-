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

// H3 — per-IP rate limit on OAuth callback. Same envelope as the start
// endpoint: 10 req/60s/IP. This bounds replay attempts and code-exchange
// brute force; legitimate users only hit this endpoint once per login.
const OAUTH_CALLBACK_RATE_LIMIT = { max: 10, windowSeconds: 60 };

function getCookie(cookieHeader: string | null, name: string): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return "";
}

function clearCookie(name: string, prod: boolean): string {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (prod) parts.push("Secure");
  return parts.join("; ");
}

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
        const expectedState = getCookie(cookieHeader, OAUTH_STATE_COOKIE);
        if (!expectedState || expectedState !== state) {
          return errorRedirect("invalid_state");
        }

        const redirectRaw = getCookie(cookieHeader, OAUTH_REDIRECT_COOKIE);
        const redirectTo = redirectRaw ? decodeURIComponent(redirectRaw) : "/";

        let userInfo;
        try {
          const tokens = await exchangeCodeForTokens(code);
          userInfo = await fetchGoogleUserInfo(tokens.access_token);
        } catch (err) {
          console.error("Google OAuth error:", err);
          return errorRedirect("token_exchange_failed");
        }

        if (!userInfo.email_verified) return errorRedirect("email_not_verified");

        let user;
        try {
          user = await upsertGoogleUser(userInfo);
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === "EMAIL_NOT_INVITED") return errorRedirect("email_not_invited");
          if (code === "USER_DISABLED") return errorRedirect("user_disabled");
          throw err;
        }
        let sessionCookie: string;
        try {
          sessionCookie = await issueSession(user);
        } catch (err) {
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
        headers.append("set-cookie", sessionCookie);
        headers.append("set-cookie", clearCookie(OAUTH_STATE_COOKIE, prod));
        headers.append("set-cookie", clearCookie(OAUTH_REDIRECT_COOKIE, prod));
        headers.set("location", redirectTo.startsWith("/") ? redirectTo : "/");

        return new Response(null, { status: 302, headers });
      },
    },
  },
});
