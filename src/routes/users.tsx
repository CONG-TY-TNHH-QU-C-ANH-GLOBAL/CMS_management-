import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { USERS } from "@/lib/cms-mock";
import { Plus, MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Users & Roles — THG Content OS" }] }),
  component: UsersPage,
});

function UsersPage() {
  return (
    <>
      <CmsTopbar title="Users & Roles" subtitle={`${USERS.length} thành viên`} action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Mời thành viên
        </button>
      } />
      <PageContainer>
        <Card>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Thành viên</th>
                <th className="text-left font-medium px-3 py-2.5">Vai trò</th>
                <th className="text-left font-medium px-3 py-2.5">Hoạt động cuối</th>
                <th className="px-5 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {USERS.map((u) => (
                <tr key={u.id} className="hover:bg-surface-muted transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br ${u.color} text-white text-sm font-semibold`}>
                        {u.name[0]}
                      </div>
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border border-border bg-surface">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{u.active}</td>
                  <td className="px-5 py-3">
                    <button className="grid place-items-center w-7 h-7 rounded-md hover:bg-muted text-muted-foreground"><MoreHorizontal className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </PageContainer>
    </>
  );
}
