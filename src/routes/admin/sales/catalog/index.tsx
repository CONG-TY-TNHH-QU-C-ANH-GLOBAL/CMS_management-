import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Edit3, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  deleteCatalogOverrideFn,
  listCatalogOverridesFn,
  type CatalogOverrideRow,
} from "@/features/catalog/catalog.actions";
import { CatalogOverrideDialog } from "@/features/catalog/components/CatalogOverrideDialog";

export const Route = createFileRoute("/admin/sales/catalog/")({
  head: () => ({ meta: [{ title: "Catalog — TH Group Content OS" }] }),
  loader: () => listCatalogOverridesFn(),
  component: CatalogOverridesPage,
});

const CATALOG_URL = "https://thgfulfill.com/vi/catalog?productId=";

function CatalogOverridesPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CatalogOverrideRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CatalogOverrideRow | null>(null);
  const del = useServerFn(deleteCatalogOverrideFn);

  const rows = data.overrides as CatalogOverrideRow[];

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa — sản phẩm quay về mặc định");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Catalog — cài đặt sản phẩm"
        subtitle="Link template design và nhãn giá trên trang Catalog. Sản phẩm, giá và biến thể vẫn sửa ở Hub."
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm sản phẩm
          </button>
        }
      />
      <PageContainer>
        {rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Chưa có sản phẩm nào. Bấm “Thêm sản phẩm” và dán link sản phẩm từ trang Catalog.
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Sản phẩm</th>
                  <th className="px-4 py-2.5 font-medium">Template design</th>
                  <th className="px-4 py-2.5 font-medium">Nhãn giá</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.label || "(chưa đặt tên)"}</div>
                      <a
                        href={`${CATALOG_URL}${r.product_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="w-3 h-3" /> {r.product_id}
                      </a>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      {r.template_url ? (
                        <a
                          href={r.template_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline break-all"
                        >
                          {r.template_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.price_includes_shipping === 1 ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                          Đã gồm ship
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted border border-border text-muted-foreground">
                          Chưa gồm ship
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingRow(r);
                            setDialogOpen(true);
                          }}
                          className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                          title="Sửa"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(r)}
                          className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                          title="Xóa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </PageContainer>

      <CatalogOverrideDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Xóa cài đặt của ${confirmDelete?.label || confirmDelete?.product_id}?`}
        description="Sản phẩm quay về mặc định: không có link template riêng, giá ghi “not including shipping cost”."
        onConfirm={handleDelete}
      />
    </>
  );
}
