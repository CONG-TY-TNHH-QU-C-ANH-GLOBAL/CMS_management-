import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";

import { inviteUserFn, type Role } from "@/features/users/users.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}

export function InviteUserDialog({ open, onOpenChange, onInvited }: Props) {
  const invite = useServerFn(inviteUserFn);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setName("");
    setRole("editor");
    setError(null);
    setPending(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await invite({ data: { email, name, role } });
      reset();
      onInvited();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không mời được. Thử lại sau.";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm px-4"
      onClick={() => !pending && onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Mời thành viên</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sau khi mời, người dùng đăng nhập bằng Google với email này sẽ vào được CMS.
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Email Google</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="ten@thgfulfill.com"
              disabled={pending}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Họ tên</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Nguyễn Văn A"
              disabled={pending}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Vai trò</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={pending}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="admin">Admin — toàn quyền</option>
              <option value="editor">Editor — chỉnh & xuất bản nội dung</option>
              <option value="viewer">Viewer — chỉ xem</option>
            </select>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {pending ? "Đang mời…" : "Gửi lời mời"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
