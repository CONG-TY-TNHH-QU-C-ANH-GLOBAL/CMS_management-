import { getDb, nowSeconds } from "@/core/db/client";

export const SESSION_COOKIE = "thg_sid";
// Session lifetime + sliding refresh.
//   - TTL: 24h. Active users refresh on activity (see SESSION_REFRESH_THRESHOLD)
//     so they never see expiry mid-task. Inactive users get pushed to login
//     after 24h.
//   - Threshold must be < TTL — otherwise refresh fires on every request and
//     writes to D1 unnecessarily. 25% of TTL = 6h remaining triggers refresh.
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h (was 30d — reduced per H1)
const SESSION_REFRESH_THRESHOLD = Math.floor(SESSION_TTL_SECONDS / 4); // refresh when <25% TTL remaining

export type Role = "admin" | "editor" | "viewer";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  picture_url: string | null;
}

export interface ActiveSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: number;
  /** User-Agent recorded at session creation. Used by readCurrentSession to
   *  detect cookie-exfiltration (attacker reusing stolen cookie from a
   *  different browser). Nullable for legacy sessions issued before H2. */
  userAgent: string | null;
}

function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
  userId: number,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ id: string; expiresAt: number }> {
  const id = generateSessionId();
  const now = nowSeconds();
  const expiresAt = now + SESSION_TTL_SECONDS;

  await getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, expiresAt, now, meta.ip ?? null, meta.userAgent ?? null)
    .run();

  await getDb()
    .prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
    .bind(now, userId)
    .run();

  return { id, expiresAt };
}

export async function getSession(sessionId: string): Promise<ActiveSession | null> {
  if (!sessionId) return null;

  const row = await getDb()
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.user_agent,
              u.id AS user_id, u.email, u.name, u.role, u.status, u.picture_url
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ? AND u.status = 'active'
        LIMIT 1`,
    )
    .bind(sessionId, nowSeconds())
    .first<{
      session_id: string;
      expires_at: number;
      user_agent: string | null;
      user_id: number;
      email: string;
      name: string;
      role: Role;
      status: string;
      picture_url: string | null;
    }>();

  if (!row) return null;

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      picture_url: row.picture_url,
    },
  };
}

export async function refreshSessionIfNeeded(
  session: ActiveSession,
): Promise<{ refreshed: boolean; expiresAt: number }> {
  const now = nowSeconds();
  if (session.expiresAt - now > SESSION_REFRESH_THRESHOLD) {
    return { refreshed: false, expiresAt: session.expiresAt };
  }
  const newExpiresAt = now + SESSION_TTL_SECONDS;
  await getDb()
    .prepare(`UPDATE sessions SET expires_at = ? WHERE id = ?`)
    .bind(newExpiresAt, session.sessionId)
    .run();
  return { refreshed: true, expiresAt: newExpiresAt };
}

export async function destroySession(sessionId: string): Promise<void> {
  await getDb().prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
}

export async function purgeExpiredSessions(): Promise<void> {
  await getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at <= ?`)
    .bind(nowSeconds())
    .run();
}

export function buildSessionCookie(
  sessionId: string,
  expiresAt: number,
  isProduction: boolean,
): string {
  const maxAge = Math.max(0, expiresAt - nowSeconds());
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(isProduction: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function parseSessionCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === SESSION_COOKIE) {
      return part.slice(eq + 1);
    }
  }
  return "";
}

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

export function hasRole(user: SessionUser, minRole: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
}
