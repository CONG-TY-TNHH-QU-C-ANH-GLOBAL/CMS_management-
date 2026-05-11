import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { logoutFn } from "@/features/auth/auth.actions";

interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  picture_url?: string | null;
}

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

interface Props {
  user: SessionUser | null;
}

export function UserMenu({ user }: Props) {
  const router = useRouter();
  const logout = useServerFn(logoutFn);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!user) return null;

  const initial = user.name.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();

  async function handleLogout() {
    setPending(true);
    try {
      await logout();
      await router.invalidate();
      router.navigate({ to: "/login", search: { redirect: "/" }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng xuất thất bại");
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg border border-border bg-surface hover:bg-surface-muted transition disabled:opacity-50"
      >
        {user.picture_url ? (
          <img
            src={user.picture_url}
            alt=""
            className="w-7 h-7 rounded-md object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="grid place-items-center w-7 h-7 rounded-md bg-gradient-brand text-white text-xs font-semibold">
            {initial}
          </div>
        )}
        <div className="hidden sm:block text-left leading-tight">
          <div className="text-xs font-medium truncate max-w-32">{user.name}</div>
          <div className="text-[10px] text-muted-foreground">{ROLE_LABEL[user.role]}</div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-40 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
            <div className="p-3 border-b border-border bg-surface-muted/40">
              <div className="flex items-center gap-2.5">
                {user.picture_url ? (
                  <img
                    src={user.picture_url}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="grid place-items-center w-9 h-9 rounded-full bg-gradient-brand text-white text-sm font-semibold">
                    {initial}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{user.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                </div>
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                {user.role === "admin" && <ShieldCheck className="w-3 h-3" />}
                {user.role !== "admin" && <UserIcon className="w-3 h-3" />}
                Vai trò: {ROLE_LABEL[user.role]}
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={pending}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent disabled:opacity-50 text-destructive"
            >
              <LogOut className="w-4 h-4" />
              {pending ? "Đang đăng xuất…" : "Đăng xuất"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
