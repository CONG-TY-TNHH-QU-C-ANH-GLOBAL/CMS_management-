import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Edit3, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { Card, PageContainer } from "@/components/cms/ui";
import { FaqDialog } from "@/features/content/components/FaqDialog";
import {
  deleteFaqFn,
  listAllFaqsFn,
  reorderFaqsFn,
  type FaqRow,
} from "@/features/content/content.actions";
import { BulkTranslateButton } from "@/features/translations/components/BulkTranslateButton";
import { TranslationReviewDialog } from "@/features/translations/components/TranslationReviewDialog";
import { TranslationStatusBadge } from "@/features/translations/components/TranslationStatusBadge";
import {
  approveFaqTranslationFn,
  deleteFaqTranslationFn,
  editFaqTranslationFn,
  listAllFaqTranslationsFn,
  listFaqTranslationsFn,
  type FaqTranslationRow,
} from "@/features/translations/translations.actions";

const FAQ_FIELDS = [
  { key: "question", label: "Question", rows: 3 },
  { key: "answer", label: "Answer", rows: 8 },
] as const;

/** Scopes the operator can author FAQs for. Each entry maps to a public
 *  landing route + the `scope` column in the `faqs` table. To enable a new
 *  scope, add an entry here AND make sure the matching landing page calls
 *  `useCmsFaqs(language, "<scope-id>")` with that scope id. */
const SCOPE_OPTIONS: { id: string; label: string; routeHint: string }[] = [
  { id: "home", label: "Trang chủ", routeHint: "/" },
  { id: "order", label: "THG Order", routeHint: "/thg-order" },
];

export const Route = createFileRoute("/admin/content/faqs/")({
  head: () => ({ meta: [{ title: "FAQ — THG Content OS" }] }),
  loader: async () => {
    const [faqsRes, transRes] = await Promise.all([listAllFaqsFn(), listAllFaqTranslationsFn()]);
    return { faqs: faqsRes.faqs, translations: transRes.rows };
  },
  component: FaqsPage,
});

function FaqsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [scope, setScope] = useState<string>("home");
  const [locale, setLocale] = useState<Locale>("vi");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<FaqRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FaqRow | null>(null);
  const [reviewing, setReviewing] = useState<{
    faqId: number;
    question: string;
    answer: string;
  } | null>(null);
  const deleteFaq = useServerFn(deleteFaqFn);
  const reorder = useServerFn(reorderFaqsFn);

  const allRows = data.faqs as FaqRow[];
  const allTranslations = data.translations as FaqTranslationRow[];

  // Map: vi faqRow.id → { en: row | null, zh: row | null }
  const translationsByFaqId = useMemo(() => {
    const map = new Map<number, { en: FaqTranslationRow | null; zh: FaqTranslationRow | null }>();
    for (const t of allTranslations) {
      const slot = map.get(t.faq_id) ?? { en: null, zh: null };
      if (t.locale === "en") slot.en = t;
      else if (t.locale === "zh") slot.zh = t;
      map.set(t.faq_id, slot);
    }
    return map;
  }, [allTranslations]);

  const filtered = useMemo(
    () =>
      allRows
        .filter((f) => f.scope === scope && f.locale === locale)
        .sort((a, b) => a.position - b.position),
    [allRows, scope, locale],
  );
  // Distinct positions within the current scope (across locales) — used as
  // the "question count" hint in the topbar.
  const distinctPositions = new Set(allRows.filter((f) => f.scope === scope).map((f) => f.position))
    .size;

  const currentScope = SCOPE_OPTIONS.find((s) => s.id === scope) ?? SCOPE_OPTIONS[0];

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteFaq({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa FAQ");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const newOrder = [...filtered];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    try {
      await reorder({ data: { scope, locale, orderedIds: newOrder.map((f) => f.id) } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sắp xếp thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Câu hỏi thường gặp"
        subtitle={`${distinctPositions} câu hỏi tại ${currentScope.label} (${currentScope.routeHint}) — mỗi câu cần 3 bản dịch`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm FAQ
          </button>
        }
      />
      <PageContainer>
        {/* Scope tabs — switch which page's FAQ list we're editing. */}
        <div className="mb-4 flex flex-wrap gap-2">
          {SCOPE_OPTIONS.map((s) => {
            const count = new Set(allRows.filter((f) => f.scope === s.id).map((f) => f.position))
              .size;
            const active = scope === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium transition border ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-surface text-foreground border-border hover:bg-surface-muted"
                }`}
              >
                <span>{s.label}</span>
                <span
                  className={`text-xs ${active ? "text-background/70" : "text-muted-foreground"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <div className="ml-auto">
            <BulkTranslateButton entityType="faq" onDone={() => router.invalidate()} />
          </div>
        </div>

        <Card className="overflow-hidden">
          <LocaleTabs value={locale} onChange={setLocale} />
          <div className="divide-y divide-border">
            {filtered.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">
                Chưa có FAQ nào ở {currentScope.label} — ngôn ngữ {locale.toUpperCase()}.
              </div>
            )}
            {filtered.map((f, idx) => (
              <div key={f.id} className="p-4 hover:bg-surface-muted transition group">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="grid place-items-center w-6 h-6 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Lên"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => move(idx, +1)}
                      disabled={idx === filtered.length - 1}
                      className="grid place-items-center w-6 h-6 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Xuống"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">#{f.position}</span>
                      <span>{f.question}</span>
                      {locale === "vi" ? (
                        <span className="inline-flex items-center gap-1 ml-1">
                          <span className="text-[10px] text-muted-foreground">EN</span>
                          <TranslationStatusBadge
                            row={translationsByFaqId.get(f.id)?.en ?? null}
                            variant="compact"
                          />
                          <span className="text-[10px] text-muted-foreground ml-1">ZH</span>
                          <TranslationStatusBadge
                            row={translationsByFaqId.get(f.id)?.zh ?? null}
                            variant="compact"
                          />
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[13px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {f.answer}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {locale === "vi" ? (
                      <button
                        onClick={() =>
                          setReviewing({ faqId: f.id, question: f.question, answer: f.answer })
                        }
                        className="grid place-items-center w-8 h-8 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        title="AI Translate (EN + ZH)"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                    <button
                      onClick={() => {
                        setEditingRow(f);
                        setDialogOpen(true);
                      }}
                      className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface hover:bg-surface-muted"
                      title="Sửa"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(f)}
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

      {/* Remount on row change so useState defaults pick up new values */}
      <FaqDialog
        key={editingRow?.id ?? `new-${scope}-${locale}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scope={scope}
        locale={locale}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa FAQ?"
        description={`Sẽ xóa câu hỏi "${confirmDelete?.question.slice(0, 80)}${(confirmDelete?.question.length ?? 0) > 80 ? "..." : ""}". Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />

      {reviewing ? (
        <TranslationReviewDialog
          open={reviewing !== null}
          onOpenChange={(o) => !o && setReviewing(null)}
          onChanged={() => router.invalidate()}
          entityType="faq"
          entityId={reviewing.faqId}
          entityLabel="FAQ"
          source={{ question: reviewing.question, answer: reviewing.answer }}
          fields={FAQ_FIELDS}
          rpcs={{
            list: listFaqTranslationsFn,
            approve: approveFaqTranslationFn,
            edit: editFaqTranslationFn,
            delete: deleteFaqTranslationFn,
          }}
          listIdKey="faq_id"
        />
      ) : null}
    </>
  );
}
