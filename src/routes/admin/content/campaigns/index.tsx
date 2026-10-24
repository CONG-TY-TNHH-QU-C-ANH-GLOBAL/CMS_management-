import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CalendarDays, Home, Pin, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { listCampaignsFn, type CampaignRow } from "@/features/campaigns/campaigns.actions";
import { effectiveFlag, vnToday } from "@/features/campaigns/campaigns.pure";
import { NewCampaignDialog } from "@/features/campaigns/components/NewCampaignDialog";
import { BulkTranslateButton } from "@/features/translations/components/BulkTranslateButton";

export const Route = createFileRoute("/admin/content/campaigns/")({
  head: () => ({ meta: [{ title: "Chương trình — TH Group Content OS" }] }),
  loader: () => listCampaignsFn(),
  component: CampaignsPage,
});

const STATUS_LABEL: Record<CampaignRow["status"], string> = {
  draft: "Nháp",
  live: "Xuất bản",
  archived: "Lưu trữ",
};

const pill = "inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-success";

function formatRange(c: CampaignRow): string {
  const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "…");
  return c.start_date || c.end_date ? `${fmt(c.start_date)} → ${fmt(c.end_date)}` : "—";
}

function CampaignsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const campaigns = data.campaigns as CampaignRow[];
  const today = vnToday();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.slug.includes(q) || c.title.toLowerCase().includes(q));
  }, [campaigns, search]);

  const liveCount = campaigns.filter((c) => c.status === "live").length;

  return (
    <>
      <CmsTopbar
        title="Chương trình"
        subtitle={`${campaigns.length} Chương trình — ${liveCount} đang xuất bản`}
        action={
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background shadow-soft transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Chương trình mới
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc đường dẫn…"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            <BulkTranslateButton entityType="campaign" onDone={() => router.invalidate()} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Chương trình</th>
                  <th className="px-3 py-2.5 text-left font-medium">Thời gian</th>
                  <th className="px-3 py-2.5 text-left font-medium">Đang hiển thị ở</th>
                  <th className="px-3 py-2.5 text-left font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-12 text-center text-sm text-muted-foreground"
                    >
                      {campaigns.length === 0
                        ? "Chưa có Chương trình nào. Bấm “Chương trình mới” để bắt đầu."
                        : "Không tìm thấy Chương trình khớp từ khóa."}
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr key={c.id} className="transition hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link
                        to="/admin/content/campaigns/$slug"
                        params={{ slug: c.slug }}
                        className="block"
                      >
                        <div className="font-medium">{c.title}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {c.slug}
                        </div>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatRange(c)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1.5 text-[11px]">
                        {effectiveFlag(c.nav_featured, c.status, c.end_date, today) && (
                          <span className={pill}>
                            <Pin className="h-3 w-3" /> Menu
                          </span>
                        )}
                        {effectiveFlag(c.home_featured, c.status, c.end_date, today) && (
                          <span className={pill}>
                            <Home className="h-3 w-3" /> Trang chủ
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{STATUS_LABEL[c.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>

      <NewCampaignDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(slug) => {
          void router.navigate({ to: "/admin/content/campaigns/$slug", params: { slug } });
        }}
      />
    </>
  );
}
