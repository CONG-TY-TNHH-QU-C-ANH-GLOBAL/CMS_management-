import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  type Role,
  type UserRow,
  deleteUserFn,
  setUserStatusFn,
  updateUserRoleFn,
} from "@/features/users/users.actions";

interface Props {
  user: UserRow;
  selfId: number | undefined;
  onChanged: () => void;
}

export function UserActionsMenu({ user, selfId, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const updateRole = useServerFn(updateUserRoleFn);
  const setStatus = useServerFn(setUserStatusFn);
  const remove = useServerFn(deleteUserFn);

  const isSelf = selfId === user.id;

  async function changeRole(role: Role) {
    if (role === user.role) {
      setOpen(false);
      return;
    }
    setPending("role");
    try {
      await updateRole({ data: { id: user.id, role } });
      toast.success(`Đã đổi vai trò ${user.email} → ${role}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi vai trò thất bại");
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  async function toggleStatus() {
    const next = user.status === "active" ? "disabled" : "active";
    setPending("status");
    try {
      await setStatus({ data: { id: user.id, status: next } });
      toast.success(next === "disabled" ? "Đã khoá tài khoản" : "Đã mở khoá tài khoản");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi trạng thái thất bại");
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  async function doDelete() {
    if (!confirm(`Xoá vĩnh viễn ${user.email}? Hành động này không thể undo.`)) {
      setOpen(false);
      return;
    }
    setPending("delete");
    try {
      await remove({ data: { id: user.id } });
      toast.success(`Đã xoá ${user.email}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xoá thất bại");
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid place-items-center w-7 h-7 rounded-md hover:bg-muted text-muted-foreground"
        disabled={pending !== null}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-40 w-56 rounded-md border border-border bg-popover shadow-lg py-1 text-sm">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              Đổi vai trò
            </div>
            {(["admin", "editor", "viewer"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => changeRole(r)}
                disabled={pending !== null}
                className={`w-full text-left px-3 py-1.5 hover:bg-accent flex items-center justify-between ${
                  user.role === r ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {r}
                {user.role === r && <span className="text-[10px]">●</span>}
              </button>
            ))}

            <div className="my-1 h-px bg-border" />

            <button
              onClick={toggleStatus}
              disabled={pending !== null || isSelf}
              className="w-full text-left px-3 py-1.5 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title={isSelf ? "Không thể tự khoá chính mình" : ""}
            >
              {user.status === "active" ? "Khoá tài khoản" : "Mở khoá tài khoản"}
            </button>

            <button
              onClick={doDelete}
              disabled={pending !== null || isSelf}
              className="w-full text-left px-3 py-1.5 hover:bg-destructive hover:text-destructive-foreground text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
              title={isSelf ? "Không thể tự xoá chính mình" : ""}
            >
              Xoá vĩnh viễn
            </button>
          </div>
        </>
      )}
    </div>
  );
}
