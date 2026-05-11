// RPC stubs for user management. Lives in lib/ so client components can import.
// Handlers run server-only and delegate to server/modules/users/service.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Re-export types so client code can import from a single place.
export type { Role } from "@/features/auth";
export type { UserRow, UserStatus } from "@/features/users";

const ROLE = z.enum(["admin", "editor", "viewer"]);

export const listUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listUsers } = await import("@/features/users");
  await requireSession("admin");
  return { users: await listUsers() };
});

const inviteSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  name: z.string().min(1, "Tên không được rỗng").max(100),
  role: ROLE,
});

export const inviteUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { inviteUser } = await import("@/features/users");
    await requireSession("admin");
    return { user: await inviteUser(data) };
  });

const updateRoleSchema = z.object({
  id: z.number().int().positive(),
  role: ROLE,
});

export const updateUserRoleFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateRoleSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateUserRole } = await import("@/features/users");
    const me = await requireSession("admin");
    await updateUserRole(me.id, data);
    return { ok: true as const };
  });

const setStatusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["active", "disabled"]),
});

export const setUserStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => setStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { setUserStatus } = await import("@/features/users");
    const me = await requireSession("admin");
    await setUserStatus(me.id, data);
    return { ok: true as const };
  });

const deleteSchema = z.object({ id: z.number().int().positive() });

export const deleteUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteUser } = await import("@/features/users");
    const me = await requireSession("admin");
    await deleteUser(me.id, data);
    return { ok: true as const };
  });
