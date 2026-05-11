// Users service — pure backend logic. No RPC wrapping here.
// Auth check is the caller's responsibility (see lib/api/users.ts).

import { getDb } from "@/core/db/client";
import type { Role } from "@/features/auth";

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
}

export async function listUsers(): Promise<UserRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, email, name, role, status, provider, picture_url, created_at, last_login_at
         FROM users ORDER BY created_at DESC`,
    )
    .all<UserRow>();
  return result.results ?? [];
}

export async function inviteUser(input: {
  email: string;
  name: string;
  role: Role;
}): Promise<UserRow> {
  const email = input.email.toLowerCase().trim();
  const existing = await getDb()
    .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();
  if (existing) {
    throw Object.assign(new Error("Email đã tồn tại trong hệ thống."), { statusCode: 409 });
  }

  const inserted = await getDb()
    .prepare(
      `INSERT INTO users (email, name, role, status, provider, created_at)
       VALUES (?, ?, ?, 'active', 'local', unixepoch())
       RETURNING id, email, name, role, status, provider, picture_url, created_at, last_login_at`,
    )
    .bind(email, input.name.trim(), input.role)
    .first<UserRow>();
  if (!inserted) throw new Error("Không tạo được user.");
  return inserted;
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
