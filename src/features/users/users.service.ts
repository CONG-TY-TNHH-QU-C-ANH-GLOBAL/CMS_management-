// Users service — pure backend logic. No RPC wrapping here.
// Auth check is the caller's responsibility (see lib/api/users.ts).

import { getDb, nowSeconds } from "@/core/db/client";
import type { Role } from "@/features/auth";
import { assertPasswordPolicy, hashPassword } from "@/features/auth/auth.password";

export type UserStatus = "active" | "disabled";

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  provider: "local" | "google";
  picture_url: string | null;
  created_at: number;
  last_login_at: number | null;
  /** 1 when the account can sign in with a password. Never exposes the hash. */
  has_password: number;
}

const USER_COLUMNS = `id, email, name, role, status, provider, picture_url, created_at,
       last_login_at, (password_hash IS NOT NULL) AS has_password`;

export async function listUsers(): Promise<UserRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC`)
    .all<UserRow>();
  return result.results ?? [];
}

export async function inviteUser(input: {
  email: string;
  name: string;
  role: Role;
  password: string;
}): Promise<UserRow> {
  const email = input.email.toLowerCase().trim();
  assertPasswordPolicy(input.password);

  const existing = await getDb()
    .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();
  if (existing) {
    throw Object.assign(new Error("Email đã tồn tại trong hệ thống."), { statusCode: 409 });
  }

  const inserted = await getDb()
    .prepare(
      `INSERT INTO users (email, name, role, status, provider, password_hash,
                          password_updated_at, created_at)
       VALUES (?, ?, ?, 'active', 'local', ?, unixepoch(), unixepoch())
       RETURNING ${USER_COLUMNS}`,
    )
    .bind(email, input.name.trim(), input.role, await hashPassword(input.password))
    .first<UserRow>();
  if (!inserted) throw new Error("Không tạo được user.");
  return inserted;
}

/**
 * Set or replace a user's password. Also clears any brute-force lockout and
 * drops that user's sessions, so a password change always forces a re-login
 * on every device — including one an attacker may be holding.
 */
export async function setUserPassword(input: { id: number; password: string }): Promise<void> {
  assertPasswordPolicy(input.password);

  const result = await getDb()
    .prepare(
      `UPDATE users
          SET password_hash = ?, password_updated_at = ?,
              failed_login_attempts = 0, locked_until = NULL
        WHERE id = ?`,
    )
    .bind(await hashPassword(input.password), nowSeconds(), input.id)
    .run();

  if (!result.meta.changes) {
    throw Object.assign(new Error("Không tìm thấy người dùng."), { statusCode: 404 });
  }

  await getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(input.id).run();
}

export async function updateUserRole(
  actorId: number,
  input: { id: number; role: Role },
): Promise<void> {
  if (input.id === actorId && input.role !== "admin") {
    throw Object.assign(new Error("Không thể tự hạ quyền chính mình."), { statusCode: 400 });
  }
  await getDb()
    .prepare(`UPDATE users SET role = ? WHERE id = ?`)
    .bind(input.role, input.id)
    .run();
}

export async function setUserStatus(
  actorId: number,
  input: { id: number; status: UserStatus },
): Promise<void> {
  if (input.id === actorId && input.status === "disabled") {
    throw Object.assign(new Error("Không thể tự khoá tài khoản chính mình."), { statusCode: 400 });
  }
  await getDb()
    .prepare(`UPDATE users SET status = ? WHERE id = ?`)
    .bind(input.status, input.id)
    .run();

  if (input.status === "disabled") {
    await getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(input.id).run();
  }
}

export async function deleteUser(actorId: number, input: { id: number }): Promise<void> {
  if (input.id === actorId) {
    throw Object.assign(new Error("Không thể tự xoá chính mình."), { statusCode: 400 });
  }
  await getDb().prepare(`DELETE FROM users WHERE id = ?`).bind(input.id).run();
}
