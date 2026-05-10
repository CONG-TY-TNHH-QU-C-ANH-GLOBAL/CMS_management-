import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { MARKETPLACES } from "@/lib/cms-mock";
import { ExternalLink, Plus, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/marketplaces")({
  head: () => ({ meta: [{ title: "Marketplaces — THG Content OS" }] }),
  component: MarketplacesPage,
});

function MarketplacesPage() {
  return (
    <>
      <CmsTopbar title="Marketplaces" subtitle="Tích hợp THG OMS với sàn TMĐT" action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Thêm marketplace
        </button>
      } />
      <PageContainer>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MARKETPLACES.map((m) => (
            <Card key={m.id} className="p-5 hover:shadow-elevated transition">
              <div className="flex items-start gap-3">
                <div className="text-3xl">{m.emoji}</div>
                <div className="flex-1">
                  <div className="font-semibold">{m.name}</div>
                  <div className="mt-1.5"><StatusBadge status={m.status} /></div>
                </div>
                <button className={`grid place-items-center w-8 h-8 rounded-md border border-border bg-surface ${m.featured ? "text-success" : "text-muted-foreground"}`}>
                  {m.featured ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between">
                {m.docs ? (
                  <a href={m.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" /> Docs
                  </a>
                ) : <span className="text-[11px] text-muted-foreground">Chưa có docs</span>}
                <button className="text-[11px] font-medium text-muted-foreground hover:text-foreground">Cấu hình</button>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
