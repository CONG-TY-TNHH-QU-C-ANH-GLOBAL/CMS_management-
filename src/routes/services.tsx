import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { SERVICES } from "@/lib/cms-mock";
import { Plus, Edit3 } from "lucide-react";

export const Route = createFileRoute("/services")({
  head: () => ({ meta: [{ title: "Services — THG Content OS" }] }),
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <>
      <CmsTopbar
        title="Services"
        subtitle="Danh mục dịch vụ hiển thị trên landing page"
        action={
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
            <Plus className="w-4 h-4" /> Thêm dịch vụ
          </button>
        }
      />
      <PageContainer>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map((s) => (
            <Card key={s.id} className="p-5 hover:shadow-elevated hover:border-primary/30 transition group">
              <div className="flex items-start justify-between">
                <div className="text-3xl">{s.icon}</div>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-4 font-semibold">{s.name}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Giá từ</div>
                  <div className="font-semibold text-foreground mt-0.5">{s.priceFrom}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tuyến vận chuyển</div>
                  <div className="font-semibold text-foreground mt-0.5">{s.routes}</div>
                </div>
              </div>
              <button className="mt-4 w-full h-8 rounded-md border border-border bg-surface text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-surface-muted transition">
                <Edit3 className="w-3.5 h-3.5" /> Chỉnh sửa
              </button>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
