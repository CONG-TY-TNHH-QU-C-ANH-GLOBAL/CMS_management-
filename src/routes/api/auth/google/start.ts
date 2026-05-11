import { createFileRoute } from "@tanstack/react-router";

import {
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  buildGoogleAuthUrl,
  generateStateToken,
  isProduction,
} from "@/features/auth";

const STATE_TTL_SECONDS = 600;

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
        const url = new URL(request.url);
        const redirect = url.searchParams.get("redirect") || "/";

        const state = generateStateToken();
        const prod = isProduction();
        const headers = new Headers();
        headers.append("set-cookie", buildShortLivedCookie(OAUTH_STATE_COOKIE, state, prod));
        headers.append(
          "set-cookie",
          buildShortLivedCookie(OAUTH_REDIRECT_COOKIE, encodeURIComponent(redirect), prod),
        );
        headers.set("location", buildGoogleAuthUrl(state));

        return new Response(null, { status: 302, headers });
      },
    },
  },
});
