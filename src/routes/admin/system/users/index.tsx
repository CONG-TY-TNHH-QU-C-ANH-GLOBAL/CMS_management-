import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus, ShieldCheck, User, Eye } from "lucide-react";
import { useState } from "react";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { InviteUserDialog } from "@/features/users/components/InviteUserDialog";
import { UserActionsMenu } from "@/features/users/components/UserActionsMenu";
import { listUsersFn, type Role, type UserRow } from "@/features/users/users.actions";

export const Route = createFileRoute("/admin/system/users/")({
  head: () => ({ meta: [{ title: "Người dùng — THG Content OS" }] }),
  loader: () => listUsersFn(),
  component: UsersPage,
});

const ROLE_META: Record<Role, { label: string; icon: typeof ShieldCheck; tone: string }> = {
  admin: { label: "Admin", icon: ShieldCheck, tone: "text-primary" },
  editor: { label: "Editor", icon: User, tone: "text-accent-foreground" },
  viewer: { label: "Viewer", icon: Eye, tone: "text-muted-foreground" },
};

function formatTime(seconds: number | null): string {
  if (!seconds) return "Chưa từng";
  const diffSec = Math.floor(Date.now() / 1000) - seconds;
  if (diffSec < 60) return "vừa xong";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} ngày trước`;
  return new Date(seconds * 1000).toLocaleDateString("vi-VN");
}

function avatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function UsersPage() {
  const data = Route.useLoaderData();
  const ctx = Route.useRouteContext();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);

  const users = data.users as UserRow[];
  const selfId = ctx.user?.id;

  function refresh() {
    router.invalidate();
  }

  return (
    <>
      <CmsTopbar
        title="Người dùng & Phân quyền"
        subtitle={`${users.length} thành viên có quyền truy cập CMS`}
        action={
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Mời thành viên
          </button>
        }
      />
      <PageContainer>
        <Card>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Thành viên</th>
                <th className="text-left font-medium px-3 py-2.5">Vai trò</th>
                <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                <th className="text-left font-medium px-3 py-2.5">Đăng nhập gần nhất</th>
                <th className="px-5 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    Chưa có thành viên nào. Click "Mời thành viên" để thêm.
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const meta = ROLE_META[u.role];
                const Icon = meta.icon;
                const isSelf = selfId === u.id;
                const isPending = !u.last_login_at;
                return (
                  <tr key={u.id} className="hover:bg-surface-muted transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {u.picture_url ? (
                          <img
                            src={u.picture_url}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="grid place-items-center w-9 h-9 rounded-full bg-gradient-brand text-white text-sm font-semibold">
                            {avatarInitial(u.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-1.5">
                            <span className="truncate">{u.name}</span>
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                                BẠN
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border border-border bg-surface">
                        <Icon className={`w-3 h-3 ${meta.tone}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {u.status === "active" ? (
                        isPending ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                            Chờ login lần đầu
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-success">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
                            Hoạt động
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                          Đã khoá
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatTime(u.last_login_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <UserActionsMenu user={u} selfId={selfId} onChanged={refresh} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </PageContainer>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={refresh} />
    </>
  );
}
