import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Edit3, Plus, Ship, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { NewShippingRouteDialog } from "@/features/shipping/components/NewShippingRouteDialog";
import {
  deleteShippingRouteSlugFn,
  listShippingRoutesFn,
  type ShippingRouteRow,
} from "@/features/shipping/shipping.actions";

export const Route = createFileRoute("/admin/content/shipping-routes/")({
  head: () => ({ meta: [{ title: "Shipping routes — THG Content OS" }] }),
  loader: () => listShippingRoutesFn(),
  component: ShippingRoutesPage,
});

interface RouteGroup {
  slug: string;
  position: number;
  kind: string | null;
  updated_at: number;
  variants: ShippingRouteRow[];
}

function ShippingRoutesPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const groups = data.groups as RouteGroup[];
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RouteGroup | null>(null);
  const del = useServerFn(deleteShippingRouteSlugFn);

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
      toast.success("Đã xóa shipping route");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Tuyến vận chuyển"
        subtitle={`${groups.length} tuyến — hiển thị tại trang Chính sách vận chuyển trên website`}
        action={
          <button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
            <Plus className="w-4 h-4" /> Tuyến mới
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên tuyến hoặc đường dẫn..."
              className="h-9 px-3 rounded-lg border border-border bg-surface-muted text-sm flex-1 max-w-xs"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted grid place-items-center mb-3">
                <Ship className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Chưa có shipping route</h3>
              <p className="text-xs text-muted-foreground">Click "Tuyến mới" để tạo tuyến đầu tiên.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((g) => {
                const ref = g.variants.find((v) => v.locale === "vi") ?? g.variants[0];
                return (
                  <div key={g.slug} className="p-4 hover:bg-surface-muted transition group">
                    <div className="flex items-start gap-3">
                      <div className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
                        <Ship className="w-4 h-4" />
                      </div>
                      <Link to="/admin/content/shipping-routes/$slug" params={{ slug: g.slug }} className="flex-1 min-w-0">
                        <div className="font-medium">{ref?.title ?? g.slug}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                          {g.slug} · #{g.position}
                          {ref?.origin && ref?.destination ? ` · ${ref.origin}→${ref.destination}` : ""}
                          {g.kind ? ` · ${g.kind}` : ""}
                        </div>
                      </Link>
                      <div className="flex items-start gap-1">
                        <StatusBadge status={ref?.status ?? "live"} />
                        <div className="flex gap-1 mt-1 ml-2">
                          {(["en", "vi", "zh"] as const).map((loc) => {
                            const variant = g.variants.find((v) => v.locale === loc);
                            return (
                              <span key={loc} className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${variant ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`} title={variant?.title ?? "Chưa có"}>
                                {loc}
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition ml-1">
                          <Link to="/admin/content/shipping-routes/$slug" params={{ slug: g.slug }} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground" title="Sửa">
                            <Edit3 className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={() => setConfirmDelete(g)} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50" title="Xóa">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </PageContainer>

      <NewShippingRouteDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(slug) => router.navigate({ to: "/admin/content/shipping-routes/$slug", params: { slug } })}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa shipping route?"
        description={`Sẽ xóa tuyến "${confirmDelete?.slug}" cùng tất cả bản dịch (Tiếng Việt, English, 中文) và bảng giá. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa toàn bộ"
        destructive
      />
    </>
  );
}
