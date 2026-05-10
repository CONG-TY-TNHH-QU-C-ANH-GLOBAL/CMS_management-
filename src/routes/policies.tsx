import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { POLICIES } from "@/lib/cms-mock";
import { Scroll, Plus, Edit3 } from "lucide-react";

export const Route = createFileRoute("/policies")({
  head: () => ({ meta: [{ title: "Policies — THG Content OS" }] }),
  component: PoliciesPage,
});

function PoliciesPage() {
  return (
    <>
      <CmsTopbar title="Chính sách" subtitle="Văn bản pháp lý & chính sách" action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Thêm policy
        </button>
      } />
      <PageContainer>
        <div className="grid sm:grid-cols-2 gap-4">
          {POLICIES.map((p) => (
            <Card key={p.id} className="p-5 hover:shadow-elevated transition">
              <div className="flex items-start gap-3">
                <div className="grid place-items-center w-10 h-10 rounded-lg bg-primary-soft text-primary"><Scroll className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{p.name}</div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.version}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Cập nhật {p.updated} trước</div>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    <button className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <Edit3 className="w-3 h-3" /> Chỉnh sửa
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
