import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Edit3, FileText, Image as ImageIcon, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { NewBlogPostDialog } from "@/features/blog/components/NewBlogPostDialog";
import { BulkTranslateButton } from "@/features/translations/components/BulkTranslateButton";
import {
  deleteBlogSlugFn,
  listBlogPostsFn,
  type BlogPostRow,
} from "@/features/blog/blog.actions";

export const Route = createFileRoute("/admin/content/blogs/")({
  head: () => ({ meta: [{ title: "Bài viết — THG Content OS" }] }),
  loader: () => listBlogPostsFn(),
  component: BlogsPage,
});

interface BlogGroup {
  slug: string;
  category: string | null;
  published_date: string | null;
  updated_at: number;
  variants: BlogPostRow[];
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return date;
  }
}

function BlogsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const groups = data.groups as BlogGroup[];
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BlogGroup | null>(null);
  const del = useServerFn(deleteBlogSlugFn);

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) => g.slug.toLowerCase().includes(q) || g.variants.some((v) => v.title.toLowerCase().includes(q)),
    );
  }, [groups, search]);

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { slug: confirmDelete.slug } });
      toast.success("Đã xóa bài viết (cả 3 ngôn ngữ)");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Bài viết Blog"
        subtitle={`${groups.length} bài viết — mỗi bài hiển thị bằng 3 ngôn ngữ trên website`}
        action={
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft transition"
          >
            <Plus className="w-4 h-4" /> Bài viết mới
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 h-9 flex-1 min-w-48 rounded-lg border border-border bg-surface-muted px-3 text-sm">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tiêu đề hoặc đường dẫn URL…"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            <BulkTranslateButton entityType="blog_post" onDone={() => router.invalidate()} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Bài viết</th>
                  <th className="text-left font-medium px-3 py-2.5">Ngôn ngữ</th>
                  <th className="text-left font-medium px-3 py-2.5">Danh mục</th>
                  <th className="text-left font-medium px-3 py-2.5">Slides</th>
                  <th className="text-left font-medium px-3 py-2.5">Đăng</th>
                  <th className="px-5 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                      Chưa có bài viết nào.
                    </td>
                  </tr>
                )}
                {filtered.map((g) => {
                  const ref = g.variants.find((v) => v.locale === "vi") ?? g.variants[0];
                  const slideCount = ref?.slide_count ?? 0;
                  return (
                    <tr key={g.slug} className="hover:bg-surface-muted transition group">
                      <td className="px-5 py-3">
                        <Link
                          to="/admin/content/blogs/$slug"
                          params={{ slug: g.slug }}
                          className="flex items-center gap-3"
                        >
                          {ref?.thumbnail_url ? (
                            <img
                              src={ref.thumbnail_url}
                              alt=""
                              className="w-10 h-10 rounded object-cover bg-muted"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="grid place-items-center w-10 h-10 rounded bg-muted text-muted-foreground">
                              <FileText className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium line-clamp-1">{ref?.title ?? g.slug}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                              {g.slug}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          {(["en", "vi", "zh"] as const).map((loc) => {
                            const variant = g.variants.find((v) => v.locale === loc);
                            return (
                              <span
                                key={loc}
                                className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                                  variant
                                    ? "bg-success/10 text-success border-success/30"
                                    : "bg-muted text-muted-foreground border-border"
                                }`}
                                title={variant ? `${variant.title} (${variant.status})` : "Chưa có"}
                              >
                                {loc}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {g.category && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            {g.category}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <ImageIcon className="w-3 h-3" /> {slideCount}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formatDate(g.published_date)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <Link
                            to="/admin/content/blogs/$slug"
                            params={{ slug: g.slug }}
                            className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                            title="Sửa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => setConfirmDelete(g)}
                            className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center gap-2 px-5 py-2.5 text-xs text-muted-foreground border-t border-border">
              <StatusBadge status="live" /> đã xuất bản &nbsp;
              <StatusBadge status="draft" /> nháp
            </div>
          </div>
        </Card>
      </PageContainer>

      <NewBlogPostDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(slug) => {
          router.navigate({ to: "/admin/content/blogs/$slug", params: { slug } });
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa bài viết?"
        description={`Sẽ xóa toàn bộ bài "${confirmDelete?.slug}" — bao gồm cả 3 bản dịch (Tiếng Việt, English, 中文) và toàn bộ slide ảnh. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa toàn bộ"
        destructive
      />
    </>
  );
}
