import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";

import { MIN_PASSWORD_LENGTH } from "@/features/auth/auth.password";
import { setUserPasswordFn, type UserRow } from "@/features/users/users.actions";

interface Props {
  user: UserRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function SetPasswordDialog({ user, open, onOpenChange, onDone }: Props) {
  const setPassword = useServerFn(setUserPasswordFn);
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Hai ô mật khẩu không khớp.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await setPassword({ data: { id: user.id, password } });
      setPasswordValue("");
      setConfirm("");
      onDone();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đặt mật khẩu thất bại.");
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
          <h2 className="text-base font-semibold text-foreground">Đặt mật khẩu</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {user.email} — mọi phiên đăng nhập hiện tại của tài khoản này sẽ bị đăng xuất.
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Mật khẩu mới
            </label>
            <input
              type="password"
              required
              autoFocus
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Tối thiểu {MIN_PASSWORD_LENGTH} ký tự.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Nhập lại mật khẩu
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={pending}
            />
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
              {pending ? "Đang lưu…" : "Lưu mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
