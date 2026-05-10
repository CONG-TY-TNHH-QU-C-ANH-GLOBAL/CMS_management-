import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { BLOGS } from "@/lib/cms-mock";
import { Bot, FileText, Plus, Search, Filter, MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/blogs")({
  head: () => ({ meta: [{ title: "Blog Posts — THG Content OS" }] }),
  component: BlogsPage,
});

function BlogsPage() {
  return (
    <>
      <CmsTopbar
        title="Bài viết Blog"
        subtitle={`${BLOGS.length} bài viết`}
        action={
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft transition">
            <Plus className="w-4 h-4" /> Bài viết mới
          </button>
        }
      />
      <PageContainer>
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 h-9 flex-1 min-w-[200px] rounded-lg border border-border bg-surface-muted px-3 text-sm">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input placeholder="Tìm tiêu đề bài viết…" className="flex-1 bg-transparent outline-none" />
            </div>
            {["Tất cả", "Đã xuất bản", "Chờ duyệt", "Bản nháp"].map((t, i) => (
              <button key={t} className={`h-9 px-3 rounded-lg text-sm font-medium transition ${i === 0 ? "bg-foreground text-background" : "border border-border bg-surface text-foreground hover:bg-surface-muted"}`}>
                {t}
              </button>
            ))}
            <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm hover:bg-surface-muted">
              <Filter className="w-4 h-4" /> Bộ lọc
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Bài viết</th>
                  <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                  <th className="text-left font-medium px-3 py-2.5">Tác giả</th>
                  <th className="text-left font-medium px-3 py-2.5">SEO Score</th>
                  <th className="text-left font-medium px-3 py-2.5">Cập nhật</th>
                  <th className="px-5 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {BLOGS.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-muted transition cursor-pointer">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`grid place-items-center w-8 h-8 rounded-lg ${b.ai ? "bg-gradient-brand text-white" : "bg-muted text-foreground"}`}>
                          {b.ai ? <Bot className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-medium">{b.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{b.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-3 text-xs">{b.author}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 w-32">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${b.seo >= 80 ? "bg-success" : b.seo >= 60 ? "bg-warning" : "bg-destructive"}`}
                            style={{ width: `${b.seo}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums w-7 text-right">{b.seo}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{b.updated} trước</td>
                    <td className="px-5 py-3">
                      <button className="grid place-items-center w-7 h-7 rounded-md hover:bg-muted text-muted-foreground">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}
