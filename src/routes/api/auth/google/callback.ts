import { createFileRoute } from "@tanstack/react-router";

import {
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  isProduction,
  issueSession,
  upsertGoogleUser,
} from "@/features/auth";

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
        const sessionCookie = await issueSession(user);

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
