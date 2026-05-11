// RPC stubs for auth state. Client components import from here.
// importProtection forbids src/server/** in client code, so this file
// (in src/lib/) acts as the bridge — handlers run server-only.

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

export const meFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readCurrentSession } = await import("@/features/auth");
  const session = await readCurrentSession();
  return session ? { user: session.user } : { user: null };
});

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const {
    isProduction,
    getCookieHeader,
    destroySession,
    parseSessionCookie,
    buildClearCookie,
  } = await import("@/features/auth");
  const sid = parseSessionCookie(getCookieHeader());
  if (sid) await destroySession(sid);
  setResponseHeader("set-cookie", buildClearCookie(isProduction()));
  return { ok: true as const };
});
