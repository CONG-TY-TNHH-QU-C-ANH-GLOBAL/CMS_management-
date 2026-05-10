import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, CardHeader, PageContainer, RiskBadge } from "@/components/cms/ui";
import { PENDING_REVIEWS } from "@/lib/cms-mock";
import { Bot, FileText, Check, X, MessageSquare, Eye, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/reviews")({
  head: () => ({ meta: [{ title: "Chờ duyệt — THG Content OS" }] }),
  component: ReviewsPage,
});

const DIFF = [
  { name: "hero_title", before: "Shipping & Fulfillment for Global Sellers", after: "Cross-border Fulfillment for POD Sellers Shipping to the US" },
  { name: "hero_subtitle", before: "From Vietnam & China warehouses to 200+ countries", after: "Specialized routes for TikTok Shop & Shopify POD merchants" },
  { name: "hero_cta", before: "Contact us", after: "Get a quote in 24h" },
];

function ReviewsPage() {
  const [selected, setSelected] = useState(PENDING_REVIEWS[0].id);
  const current = PENDING_REVIEWS.find((r) => r.id === selected)!;

  return (
    <>
      <CmsTopbar title="Chờ duyệt" subtitle={`${PENDING_REVIEWS.length} item`} />
      <PageContainer>
        <div className="grid lg:grid-cols-5 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader title="Queue" hint="Sắp xếp theo mức độ rủi ro" />
            <ul className="divide-y divide-border max-h-[640px] overflow-y-auto">
              {PENDING_REVIEWS.map((r) => (
                <li
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`px-4 py-3 cursor-pointer transition ${selected === r.id ? "bg-primary-soft border-l-2 border-primary" : "hover:bg-surface-muted border-l-2 border-transparent"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 grid place-items-center w-8 h-8 rounded-lg ${r.ai ? "bg-gradient-brand text-white" : "bg-muted text-foreground"}`}>
                      {r.ai ? <Bot className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug">{r.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{r.type}</span>·<span>{r.by}</span>·<span>{r.time}</span>
                      </div>
                    </div>
                    <RiskBadge risk={r.risk} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="lg:col-span-3 space-y-4">
            <Card>
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{current.type}</div>
                    <div className="font-semibold text-lg mt-0.5">{current.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">Đề xuất bởi {current.by} · {current.time}</div>
                  </div>
                  <RiskBadge risk={current.risk} />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-success text-success-foreground text-sm font-medium hover:opacity-90 shadow-soft transition">
                    <Check className="w-4 h-4" /> Phê duyệt & publish
                  </button>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted transition">
                    <MessageSquare className="w-4 h-4" /> Yêu cầu chỉnh sửa
                  </button>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition">
                    <X className="w-4 h-4" /> Từ chối
                  </button>
                  <button className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted transition">
                    <Eye className="w-4 h-4" /> Preview
                  </button>
                </div>
              </div>

              <div className="p-5">
                <div className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Diff các trường thay đổi</div>
                <div className="space-y-3">
                  {DIFF.map((d) => (
                    <div key={d.name} className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3 py-2 bg-surface-muted border-b border-border flex items-center justify-between">
                        <span className="text-xs font-mono">{d.name}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                        <div className="p-3 bg-destructive/5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-destructive mb-1">Trước</div>
                          <div className="text-sm">{d.before}</div>
                        </div>
                        <div className="p-3 bg-success/5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-success mb-1">Sau</div>
                          <div className="text-sm">{d.after}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs font-semibold mb-2">Bình luận ({2})</div>
              <div className="space-y-3">
                <div className="flex gap-2.5">
                  <div className="grid place-items-center w-7 h-7 rounded-full bg-gradient-brand text-white text-xs font-semibold shrink-0">L</div>
                  <div className="flex-1">
                    <div className="text-xs"><span className="font-medium">Linh Trần</span> <span className="text-muted-foreground">· 1 giờ trước</span></div>
                    <div className="text-sm mt-0.5">Hero mới đúng tone POD seller, nhưng CTA "24h" có chắc deliver được không nhỉ?</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="grid place-items-center w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-white text-xs font-semibold shrink-0">K</div>
                  <div className="flex-1">
                    <div className="text-xs"><span className="font-medium">Khôi Vũ</span> <span className="text-muted-foreground">· 35 phút trước</span></div>
                    <div className="text-sm mt-0.5">Sales OK với 24h cho lead VN, US thì cần 36h. Có thể đổi thành "fast quote".</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <input placeholder="Thêm bình luận…" className="flex-1 h-9 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none focus:border-primary" />
                <button className="h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium">Gửi</button>
              </div>
            </Card>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
