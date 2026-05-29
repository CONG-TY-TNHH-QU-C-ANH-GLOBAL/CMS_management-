import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Edit3, Flame, MapPin, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { NewCareersJobDialog } from "@/features/careers/components/NewCareersJobDialog";
import { BulkTranslateButton } from "@/features/translations/components/BulkTranslateButton";
import {
  deleteCareersJobSlugFn,
  listCareersJobsFn,
  type CareersJobRow,
} from "@/features/careers/careers.actions";

export const Route = createFileRoute("/admin/content/careers/")({
  loader: () => listCareersJobsFn(),
  component: CareersList,
});

interface JobGroup {
  slug: string;
  category: string | null;
  position: number;
  hot: number;
  updated_at: number;
  variants: CareersJobRow[];
}

function CareersList() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const groups = data.groups as JobGroup[];
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<JobGroup | null>(null);
  const del = useServerFn(deleteCareersJobSlugFn);

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) => g.slug.toLowerCase().includes(q) || g.variants.some((v) => v.title.toLowerCase().includes(q)),
    );
  }, [groups, search]);

  const openCount = groups.filter((g) => g.variants.some((v) => v.status === "open")).length;

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { slug: confirmDelete.slug } });
      toast.success("Đã xóa vị trí (cả 3 ngôn ngữ)");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <PageContainer>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Vị trí tuyển dụng</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {openCount} vị trí đang tuyển · {groups.length} vị trí tổng — mỗi vị trí có thể dịch sang 3 ngôn ngữ
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên vị trí hoặc đường dẫn..."
              className="h-9 px-3 rounded-lg border border-border bg-surface-muted text-sm w-48"
            />
            <BulkTranslateButton entityType="careers_job" onDone={() => router.invalidate()} />
            <button
              onClick={() => setNewOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
            >
              <Plus className="w-4 h-4" /> Đăng tin mới
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Vị trí</th>
                <th className="text-left font-medium px-3 py-2.5">Locale</th>
                <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                <th className="text-left font-medium px-3 py-2.5">Loại</th>
                <th className="text-left font-medium px-3 py-2.5">Salary</th>
                <th className="px-5 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    Chưa có tin tuyển dụng nào.
                  </td>
                </tr>
              )}
              {filtered.map((g) => {
                const ref = g.variants.find((v) => v.locale === "vi") ?? g.variants[0];
                return (
                  <tr key={g.slug} className="hover:bg-surface-muted transition group">
                    <td className="px-5 py-3">
                      <Link to="/admin/content/careers/$jobId" params={{ jobId: g.slug }} className="flex items-center gap-3">
                        <div className="grid place-items-center w-9 h-9 rounded bg-muted text-muted-foreground">
                          <Briefcase className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium line-clamp-1 flex items-center gap-1.5">
                            {ref?.title ?? g.slug}
                            {g.hot ? <Flame className="w-3.5 h-3.5 text-warning" /> : null}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                            {g.slug}
                            {g.category ? ` · ${g.category}` : ""}
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
                              title={variant?.title ?? "Chưa có"}
                            >
                              {loc}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={ref?.status ?? "open"} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {ref?.employment_type}
                      {ref?.location ? <><br /><MapPin className="inline w-3 h-3 mr-0.5" />{ref.location}</> : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {ref?.salary && <>{ref.salary} {ref.salary_unit ?? ""}</>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <Link to="/admin/content/careers/$jobId" params={{ jobId: g.slug }} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground" title="Sửa">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Link>
                        <button onClick={() => setConfirmDelete(g)} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50" title="Xóa">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <NewCareersJobDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(slug) => router.navigate({ to: "/admin/content/careers/$jobId", params: { jobId: slug } })}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa vị trí?"
        description={`Sẽ xóa vị trí "${confirmDelete?.slug}" cùng tất cả bản dịch (Tiếng Việt, English, 中文). Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa toàn bộ"
        destructive
      />
    </PageContainer>
  );
}
