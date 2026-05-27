import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

import { getDb, nowSeconds } from "@/core/db/client";
import { requireSafeOrigin } from "@/core/middlewares/csrf";
import { type GoogleUserInfo } from "./auth.google";
import {
  type ActiveSession,
  type Role,
  type SessionUser,
  buildSessionCookie,
  createSession,
  deleteOtherSessions,
  destroySession,
  getSession,
  hasRole,
  parseSessionCookie,
  refreshSessionIfNeeded,
} from "./auth.session";

export function isProduction(): boolean {
  return import.meta.env.PROD;
}

export function getCookieHeader(): string | null {
  return getRequest().headers.get("cookie");
}

export function getRequestMeta(): { ip?: string; userAgent?: string } {
  const req = getRequest();
  return {
    ip:
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for") ??
      undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}

export async function readCurrentSession(): Promise<ActiveSession | null> {
  const sid = parseSessionCookie(getCookieHeader());
  if (!sid) return null;
  const session = await getSession(sid);
  if (!session) return null;

  // H2 — User-Agent binding. Sessions table records the User-Agent at
  // creation time; we destroy the session if the cookie is reused from a
  // different browser (the canonical XSS-exfiltration signature).
  //
  // Hard binding ONLY on UA — we deliberately do NOT bind on IP because
  // mobile/4G admins legitimately change IP within a single session. The
  // UA check catches the most common cookie-theft vector (attacker on a
  // different browser/headless tool) with minimal UX disruption.
  //
  // Legacy sessions created before H2 have userAgent=null in DB — we skip
  // the check for those (the column was nullable from day one). New
  // sessions issued post-H2 will always have userAgent populated.
  const currentUA = getRequest().headers.get("user-agent");
  if (session.userAgent && currentUA && session.userAgent !== currentUA) {
    // Mismatch → destroy session defensively, force re-login.
    await destroySession(sid);
    return null;
  }

  const refresh = await refreshSessionIfNeeded(session);
  if (refresh.refreshed) {
    setResponseHeader(
      "set-cookie",
      buildSessionCookie(session.sessionId, refresh.expiresAt, isProduction()),
    );
  }
  return session;
}

export async function requireSession(minRole: Role = "viewer"): Promise<SessionUser> {
  // H4 — CSRF: validate Origin/Referer host == BASE_URL host on state-
  // changing methods. requireSafeOrigin() is a no-op for GET/HEAD/OPTIONS,
  // so listing endpoints that call requireSession see no behavior change.
  // Mutations (POST/PUT/DELETE) that call requireSession get CSRF defense
  // for free — no per-handler wiring required.
  requireSafeOrigin();

  const session = await readCurrentSession();
  if (!session) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401, code: "UNAUTHORIZED" });
  }
  if (!hasRole(session.user, minRole)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403, code: "FORBIDDEN" });
  }
  return session.user;
}

/**
 * Upsert a user from a successful Google OAuth callback.
 *
 * Whitelist policy:
 * - If `users` table is EMPTY → bootstrap the first user as admin (initial setup).
 * - If user with this email exists → update Google fields and return.
 * - If user with this email does NOT exist (and table is not empty) → reject;
 *   admin must invite the email first via `/users` admin UI.
 */
export async function upsertGoogleUser(info: GoogleUserInfo): Promise<SessionUser> {
  const email = info.email.toLowerCase().trim();
  const name = info.name || info.given_name || email.split("@")[0];
  const now = nowSeconds();

  const existing = await getDb()
    .prepare(`SELECT id, email, name, role, status FROM users WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<{ id: number; email: string; name: string; role: Role; status: string }>();

  if (existing) {
    if (existing.status !== "active") {
      throw Object.assign(new Error("disabled"), { statusCode: 403, code: "USER_DISABLED" });
    }
    await getDb()
      .prepare(
        `UPDATE users
            SET provider = 'google',
                provider_user_id = ?,
                picture_url = ?,
                name = COALESCE(NULLIF(?, ''), name)
          WHERE id = ?`,
      )
      .bind(info.sub, info.picture ?? null, name, existing.id)
      .run();
    return {
      id: existing.id,
      email: existing.email,
      name,
      role: existing.role,
      picture_url: info.picture ?? null,
    };
  }

  // No existing user → check bootstrap.
  const countRow = await getDb()
    .prepare(`SELECT COUNT(*) AS n FROM users`)
    .first<{ n: number }>();

  if ((countRow?.n ?? 0) > 0) {
    throw Object.assign(new Error("not_invited"), {
      statusCode: 403,
      code: "EMAIL_NOT_INVITED",
    });
  }

  // Bootstrap: first ever user becomes admin.
  const insert = await getDb()
    .prepare(
      `INSERT INTO users (email, name, role, status, provider, provider_user_id, picture_url, created_at)
       VALUES (?, ?, 'admin', 'active', 'google', ?, ?, ?)
       RETURNING id, email, name, role, picture_url`,
    )
    .bind(email, name, info.sub, info.picture ?? null, now)
    .first<{ id: number; email: string; name: string; role: Role; picture_url: string | null }>();

  if (!insert) throw new Error("Không tạo được tài khoản từ Google OAuth.");
  return insert;
}

/**
 * Issue a session cookie for a user. Used after Google OAuth verifies them.
 *
 * Single-active-session policy
 * ────────────────────────────
 * After creating the new session row, we delete every other session row
 * belonging to this user. This defends against stolen-cookie replay: if an
 * attacker exfiltrates a session cookie, the user can reset access by simply
 * logging in again — the attacker's cookie no longer maps to a live row.
 *
 * The order is CREATE → DELETE OTHERS (not the reverse). Under concurrent
 * logins this converges to a single active session because each cleanup
 * deletes any rows it didn't itself insert. Reversing the order races toward
 * keeping multiple active sessions, silently undoing the defense.
 *
 * The cleanup is BLOCKING: if the DELETE throws, we roll back the freshly-
 * created session and surface a 500. Letting the cleanup fail silently would
 * issue a valid cookie while leaving compromised sessions alive — admin auth
 * is not the place for best-effort cleanup.
 */
export async function issueSession(user: SessionUser): Promise<string> {
  const meta = getRequestMeta();
  const session = await createSession(user.id, meta);

  try {
    await deleteOtherSessions(user.id, session.id);
  } catch (err) {
    // Roll back the new session so we don't return a cookie for an
    // unprotected login. Best-effort — if rollback itself fails, the orphan
    // row gets reaped by purgeExpiredSessions() / 24h TTL.
    try {
      await destroySession(session.id);
    } catch {
      // swallow — surfacing the original error matters more
    }
    throw Object.assign(new Error("Failed to invalidate prior sessions on login."), {
      statusCode: 500,
      code: "SESSION_CLEANUP_FAILED",
      cause: err,
    });
  }

  return buildSessionCookie(session.id, session.expiresAt, isProduction());
}

