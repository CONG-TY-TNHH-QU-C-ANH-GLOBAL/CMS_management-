import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import { GlossaryDialog } from "@/features/translations/components/GlossaryDialog";
import {
  deleteGlossaryTermFn,
  listGlossaryFn,
  type GlossaryCategory,
  type GlossaryRow,
} from "@/features/translations/glossary.actions";

const CATEGORY_FILTERS: { id: GlossaryCategory | "all"; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "brand", label: "Brand" },
  { id: "warehouse", label: "Warehouse" },
  { id: "shipping", label: "Shipping" },
  { id: "ecommerce", label: "eCommerce" },
  { id: "payments", label: "Payments" },
  { id: "marketing", label: "Marketing" },
  { id: "general", label: "General" },
];

const CATEGORY_BADGE_TINT: Record<GlossaryCategory, string> = {
  brand: "bg-purple-100 text-purple-900",
  warehouse: "bg-blue-100 text-blue-900",
  shipping: "bg-emerald-100 text-emerald-900",
  ecommerce: "bg-amber-100 text-amber-900",
  payments: "bg-rose-100 text-rose-900",
  marketing: "bg-pink-100 text-pink-900",
  general: "bg-slate-100 text-slate-900",
};

export const Route = createFileRoute("/admin/content/glossary/")({
  head: () => ({ meta: [{ title: "Glossary — THG Content OS" }] }),
  loader: () => listGlossaryFn(),
  component: GlossaryPage,
});

function GlossaryPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [category, setCategory] = useState<GlossaryCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<GlossaryRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GlossaryRow | null>(null);
  const deleteTerm = useServerFn(deleteGlossaryTermFn);

  const allRows = data.glossary as GlossaryRow[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((g) => category === "all" || g.category === category)
      .filter(
        (g) =>
          q === "" ||
          g.term_vi.toLowerCase().includes(q) ||
          g.term_en.toLowerCase().includes(q) ||
          g.term_zh.toLowerCase().includes(q),
      )
      .sort((a, b) => a.category.localeCompare(b.category) || a.term_vi.localeCompare(b.term_vi));
  }, [allRows, category, search]);

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteTerm({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa term");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of allRows) counts.set(g.category, (counts.get(g.category) ?? 0) + 1);
    return counts;
  }, [allRows]);

  return (
    <>
      <CmsTopbar
        title="Glossary"
        subtitle={`${allRows.length} term — branding/SEO vocabulary injected vào prompt AI translate`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm term
          </button>
        }
      />
      <PageContainer>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {CATEGORY_FILTERS.map((c) => {
            const active = category === c.id;
            const count = c.id === "all" ? allRows.length : (categoryCounts.get(c.id) ?? 0);
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium transition border ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-surface text-foreground border-border hover:bg-surface-muted"
                }`}
              >
                <span>{c.label}</span>
                <span
                  className={`text-xs ${active ? "text-background/70" : "text-muted-foreground"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <div className="flex-1" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo VI / EN / ZH…"
            className="h-9 w-64 px-3 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_1fr_1fr_60px_120px] gap-3 px-4 py-2.5 border-b border-border bg-surface-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Category</div>
            <div>Term (VI)</div>
            <div>EN</div>
            <div>ZH</div>
            <div className="text-right">Pri</div>
            <div className="text-right">Actions</div>
          </div>
          <div className="divide-y divide-border">
            {filtered.length === 0 ? (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">
                Chưa có term nào.
                {category !== "all" || search ? " Thử bộ lọc khác." : ""}
              </div>
            ) : null}
            {filtered.map((g) => (
              <div
                key={g.id}
                className="grid grid-cols-[110px_1fr_1fr_1fr_60px_120px] gap-3 px-4 py-2.5 items-center hover:bg-surface-muted transition group"
              >
                <div>
                  <span
                    className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${CATEGORY_BADGE_TINT[g.category]}`}
                  >
                    {g.category}
                  </span>
                </div>
                <div className="font-medium text-sm truncate">{g.term_vi}</div>
                <div className="text-sm text-muted-foreground truncate">{g.term_en}</div>
                <div className="text-sm text-muted-foreground truncate">{g.term_zh}</div>
                <div className="text-right text-sm text-muted-foreground tabular-nums">
                  {g.priority}
                </div>
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => {
                      setEditingRow(g);
                      setDialogOpen(true);
                    }}
                    className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface hover:bg-surface-muted"
                    title="Sửa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(g)}
                    className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </PageContainer>

      <GlossaryDialog
        key={editingRow?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa glossary term?"
        description={`Sẽ xóa "${confirmDelete?.term_vi}". Các translation đã tạo trước đó không bị ảnh hưởng, nhưng prompt AI sau này sẽ không còn term này.`}
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}
