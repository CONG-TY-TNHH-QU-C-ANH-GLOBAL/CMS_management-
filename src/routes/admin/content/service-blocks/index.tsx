import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Edit3, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  deleteServiceBlockFn,
  listAllServiceBlocksFn,
} from "@/features/content/content.actions";
import type { ServiceBlockRow } from "@/features/content";
import { ServiceBlockDialog } from "@/features/content/components/ServiceBlockDialog";
import { BulkTranslateButton } from "@/features/translations/components/BulkTranslateButton";
import { TranslationReviewDialog } from "@/features/translations/components/TranslationReviewDialog";
import {
  approveServiceBlockTranslationFn,
  deleteServiceBlockTranslationFn,
  editServiceBlockTranslationFn,
  listServiceBlockTranslationsFn,
} from "@/features/translations/translations.actions";

const SB_FIELDS = [
  { key: "title", label: "Title", rows: 2 },
  { key: "description", label: "Description", rows: 6 },
  { key: "payload_json", label: "Payload (JSON)", rows: 6 },
] as const;

export const Route = createFileRoute("/admin/content/service-blocks/")({
  head: () => ({ meta: [{ title: "Service blocks — THG Content OS" }] }),
  loader: () => listAllServiceBlocksFn(),
  component: ServiceBlocksPage,
});

function ServiceBlocksPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const blocks = data.blocks as ServiceBlockRow[];
  const [locale, setLocale] = useState<Locale>("vi");
  const [pageSlug, setPageSlug] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [editing, setEditing] = useState<ServiceBlockRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ServiceBlockRow | null>(null);
  const [reviewing, setReviewing] = useState<ServiceBlockRow | null>(null);
  const del = useServerFn(deleteServiceBlockFn);

  // Distinct page_slug + kind values from current data — drives filter chips.
  const { pageSlugs, kinds } = useMemo(() => {
    const ps = new Set<string>();
    const ks = new Set<string>();
    for (const b of blocks) {
      ps.add(b.page_slug);
      if (!pageSlug || b.page_slug === pageSlug) ks.add(b.kind);
    }
    return { pageSlugs: [...ps].sort(), kinds: [...ks].sort() };
  }, [blocks, pageSlug]);

  const filtered = useMemo(
    () =>
      blocks
        .filter((b) => b.locale === locale)
        .filter((b) => !pageSlug || b.page_slug === pageSlug)
        .filter((b) => !kind || b.kind === kind)
        .sort((a, b) => a.position - b.position || a.id - b.id),
    [blocks, locale, pageSlug, kind],
  );

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa service block");
      setConfirmDelete(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Service blocks"
        subtitle={`${blocks.length} block — chia theo trang & loại. VI là canonical, EN/ZH dịch qua AI.`}
        action={<BulkTranslateButton entityType="service_block" onDone={() => router.invalidate()} />}
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <LocaleTabs value={locale} onChange={setLocale} />

          {/* Page slug + kind filter chips */}
          <div className="px-4 py-3 border-b border-border space-y-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground font-medium">Trang:</span>
              <button
                onClick={() => {
                  setPageSlug("");
                  setKind("");
                }}
                className={`h-7 px-2.5 rounded-md border ${pageSlug === "" ? "bg-foreground text-background border-foreground" : "border-border bg-surface hover:bg-surface-muted"}`}
              >
                Tất cả
              </button>
              {pageSlugs.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPageSlug(p);
                    setKind("");
                  }}
                  className={`h-7 px-2.5 rounded-md border ${pageSlug === p ? "bg-foreground text-background border-foreground" : "border-border bg-surface hover:bg-surface-muted"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            {pageSlug ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground font-medium">Loại:</span>
                <button
                  onClick={() => setKind("")}
                  className={`h-7 px-2.5 rounded-md border ${kind === "" ? "bg-foreground text-background border-foreground" : "border-border bg-surface hover:bg-surface-muted"}`}
                >
                  Tất cả
                </button>
                {kinds.map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`h-7 px-2.5 rounded-md border ${kind === k ? "bg-foreground text-background border-foreground" : "border-border bg-surface hover:bg-surface-muted"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="divide-y divide-border">
            {filtered.length === 0 ? (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">
                Không có block nào ở filter hiện tại.
              </div>
            ) : null}
            {filtered.map((b) => (
              <div key={b.id} className="px-4 py-3 group hover:bg-surface-muted/40 transition">
                <div className="flex items-start gap-3">
                  <div className="text-[10px] font-mono text-muted-foreground pt-1 w-12 shrink-0">
                    #{b.position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.icon ? <span className="text-base">{b.icon}</span> : null}
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-surface-muted px-1.5 py-0.5 rounded">
                        {b.page_slug} · {b.kind}
                      </span>
                      <span className="text-sm font-medium text-foreground line-clamp-1">
                        {b.title || <em className="text-muted-foreground">(no title)</em>}
                      </span>
                    </div>
                    {b.description ? (
                      <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {b.description}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    {locale === "vi" ? (
                      <button
                        onClick={() => setReviewing(b)}
                        className="grid place-items-center w-8 h-8 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        title="AI Translate (EN + ZH)"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                    <button
                      onClick={() => setEditing(b)}
                      className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface hover:bg-surface-muted"
                      title="Sửa"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(b)}
                      className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </PageContainer>

      <ServiceBlockDialog
        key={editing?.id ?? "none"}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        row={editing}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa service block?"
        description={`Sẽ xóa block "${confirmDelete?.title?.slice(0, 80) ?? confirmDelete?.kind}". Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />

      {reviewing ? (
        <TranslationReviewDialog
          open={reviewing !== null}
          onOpenChange={(o) => !o && setReviewing(null)}
          onChanged={() => router.invalidate()}
          entityType="service_block"
          entityId={reviewing.id}
          entityLabel={`${reviewing.page_slug}/${reviewing.kind}`}
          source={{
            title: reviewing.title ?? "",
            description: reviewing.description ?? "",
            payload_json: reviewing.payload_json ?? "{}",
          }}
          fields={SB_FIELDS}
          rpcs={{
            list: listServiceBlockTranslationsFn,
            approve: approveServiceBlockTranslationFn,
            edit: editServiceBlockTranslationFn,
            delete: deleteServiceBlockTranslationFn,
          }}
          listIdKey="service_block_id"
        />
      ) : null}
    </>
  );
}
