// RPC stubs for auth state. Client components import from here.
// importProtection forbids src/server/** in client code, so this file
// (in src/lib/) acts as the bridge — handlers run server-only.

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSafeOrigin } from "@/core/middlewares/csrf";

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Nhập mật khẩu").max(200),
});

export const loginWithPasswordFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }) => {
    requireSafeOrigin(); // H4 — CSRF: reject if Origin/Referer ≠ BASE_URL host
    const { authenticateWithPassword, issueSession } = await import("@/features/auth");
    const user = await authenticateWithPassword(data);
    setResponseHeader("set-cookie", await issueSession(user));
    return { ok: true as const };
  });

export const meFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readCurrentSession } = await import("@/features/auth");
  const session = await readCurrentSession();
  return session ? { user: session.user } : { user: null };
});

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  requireSafeOrigin(); // H4 — CSRF: reject if Origin/Referer ≠ BASE_URL host
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
