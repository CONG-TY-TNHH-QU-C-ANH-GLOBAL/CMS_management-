import { useRouterState } from "@tanstack/react-router";
import { Bell, Plus, Search } from "lucide-react";

import { UserMenu } from "./UserMenu";

interface RouteContextWithUser {
  user?: {
    id: number;
    email: string;
    name: string;
    role: "admin" | "editor" | "viewer";
    picture_url?: string | null;
  } | null;
}

export function CmsTopbar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  // Pull current user from the root route context (set in __root.tsx beforeLoad).
  const user = useRouterState({
    select: (state) => {
      for (const match of state.matches) {
        const ctx = match.context as RouteContextWithUser | undefined;
        if (ctx?.user) return ctx.user;
      }
      return null;
    },
  });

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center gap-4 h-16 px-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold truncate">{title}</h1>
            {subtitle && <span className="text-sm text-muted-foreground truncate">— {subtitle}</span>}
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("cms:open-palette"))}
          className="hidden md:flex items-center gap-2 h-9 w-72 rounded-lg border border-border bg-surface-muted px-3 text-sm text-muted-foreground hover:bg-surface transition text-left"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 truncate">Tìm kiếm bài viết, tác vụ AI, người dùng…</span>
          <kbd className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
        </button>

        {action ?? (
          <button className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition shadow-soft">
            <Plus className="w-4 h-4" />
            Tạo mới
          </button>
        )}

        <button className="relative grid place-items-center h-9 w-9 rounded-lg border border-border bg-surface hover:bg-surface-muted transition">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive ring-2 ring-background" />
        </button>

        <UserMenu user={user} />
      </div>
    </header>
  );
}
