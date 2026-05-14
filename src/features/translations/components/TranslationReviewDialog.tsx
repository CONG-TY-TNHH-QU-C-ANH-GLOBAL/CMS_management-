// Side-by-side review modal for one FAQ's translations.
// Single-row scope per spec §6.1 (no bulk in Phase 3). Operator can:
//   - Generate EN+ZH drafts (or just missing ones)
//   - Edit draft/reviewed content + save
//   - Approve a draft → reviewed
//   - Re-translate (replaces current with fresh AI call)
//   - Delete a translation row (operator must not be trapped by bad AI)
//
// Stale visual: if row.status === 'stale', show source_snapshot preview
// (the VI text the AI translated from) so operator can decide between
// re-translate vs approve-as-is.

import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import {
  approveFaqTranslationFn,
  deleteFaqTranslationFn,
  editFaqTranslationFn,
  listFaqTranslationsFn,
  translateFn,
  type FaqTranslationRow,
} from "@/features/translations/translations.actions";

import { TranslationStatusBadge } from "./TranslationStatusBadge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Triggers parent loader invalidate so VI list refreshes status pills. */
  onChanged: () => void;
  /** Source FAQ ID (locale=vi row in `faqs` table). */
  faqId: number;
  /** Snapshot of the current VI source to show on the left side. */
  source: { question: string; answer: string };
}

type Locale = "en" | "zh";
const LOCALES: Locale[] = ["en", "zh"];
const LOCALE_FLAG: Record<Locale, string> = { en: "🇺🇸", zh: "🇨🇳" };
const LOCALE_LABEL: Record<Locale, string> = { en: "English", zh: "中文" };

interface LocaleEditState {
  question: string;
  answer: string;
  dirty: boolean;
}

export function TranslationReviewDialog({ open, onOpenChange, onChanged, faqId, source }: Props) {
  const listFn = useServerFn(listFaqTranslationsFn);
  const translate = useServerFn(translateFn);
  const approve = useServerFn(approveFaqTranslationFn);
  const edit = useServerFn(editFaqTranslationFn);
  const del = useServerFn(deleteFaqTranslationFn);

  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [rows, setRows] = useState<Record<Locale, FaqTranslationRow | null>>({
    en: null,
    zh: null,
  });
  const [edits, setEdits] = useState<Record<Locale, LocaleEditState>>({
    en: { question: "", answer: "", dirty: false },
    zh: { question: "", answer: "", dirty: false },
  });
  const [confirmDelete, setConfirmDelete] = useState<{ locale: Locale; id: number } | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({ data: { faq_id: faqId } });
      const byLocale: Record<Locale, FaqTranslationRow | null> = { en: null, zh: null };
      for (const r of res.rows) {
        if (r.locale === "en" || r.locale === "zh") byLocale[r.locale as Locale] = r;
      }
      setRows(byLocale);
      setEdits({
        en: {
          question: byLocale.en?.question ?? "",
          answer: byLocale.en?.answer ?? "",
          dirty: false,
        },
        zh: {
          question: byLocale.zh?.question ?? "",
          answer: byLocale.zh?.answer ?? "",
          dirty: false,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được bản dịch");
    } finally {
      setLoading(false);
    }
  }, [faqId, listFn]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function onGenerate(targetLocales: Locale[]) {
    if (targetLocales.length === 0) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await translate({
        data: {
          entity_type: "faq",
          entity_id: faqId,
          target_locales: targetLocales,
        },
      });
      const summary = res.drafts.map((d) => `${d.locale.toUpperCase()}: ${d.status}`).join(" · ");
      const reuseHint = res.reused_existing.length
        ? ` (reused: ${res.reused_existing.join(", ")})`
        : "";
      toast.success(`Translated ${summary}${reuseHint}`);
      await reload();
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Translate thất bại";
      setTranslateError(msg);
      toast.error(msg);
    } finally {
      setTranslating(false);
    }
  }

  async function onApprove(locale: Locale) {
    const row = rows[locale];
    if (!row) return;
    if (edits[locale].dirty) {
      // Save edits first; this demotes the row to draft. Operator must
      // explicitly Approve again after save — prevents accidental
      // "edit and ship" without conscious approval step.
      toast.info("Lưu chỉnh sửa trước khi Approve nhé.");
      return;
    }
    try {
      await approve({ data: { id: row.id } });
      toast.success(`Approved ${LOCALE_LABEL[locale]}`);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve thất bại");
    }
  }

  async function onSaveEdits(locale: Locale) {
    const row = rows[locale];
    if (!row) return;
    const e = edits[locale];
    if (!e.dirty) return;
    try {
      await edit({ data: { id: row.id, question: e.question, answer: e.answer } });
      toast.success(`Đã lưu chỉnh sửa ${LOCALE_LABEL[locale]} — status quay về draft`);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    }
  }

  async function onDelete(locale: Locale) {
    const row = rows[locale];
    if (!row) return;
    try {
      await del({ data: { id: row.id } });
      toast.success(`Đã xóa bản dịch ${LOCALE_LABEL[locale]}`);
      setConfirmDelete(null);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  function setEditField(locale: Locale, field: "question" | "answer", value: string) {
    setEdits((prev) => {
      const next = { ...prev[locale], [field]: value };
      const original = rows[locale];
      const dirty =
        (original?.question ?? "") !== next.question || (original?.answer ?? "") !== next.answer;
      return { ...prev, [locale]: { ...next, dirty } };
    });
  }

  if (!open) return null;

  const missingLocales: Locale[] = LOCALES.filter((l) => !rows[l]);
  const hasAnyRow = LOCALES.some((l) => rows[l]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-6 overflow-y-auto"
        onClick={() => !translating && onOpenChange(false)}
      >
        <div
          className="w-full max-w-6xl rounded-xl border border-border bg-background shadow-glow my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" /> AI Translate · FAQ #{faqId}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                VI source (canonical) → EN + ZH drafts. Review từng ngôn ngữ trước khi Approve.
              </p>
            </div>
            <button
              onClick={() => !translating && onOpenChange(false)}
              disabled={translating}
              className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-50"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Generate bar */}
          <div className="px-5 py-3 border-b border-border bg-surface-muted/40 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onGenerate(missingLocales.length > 0 ? missingLocales : LOCALES)}
              disabled={translating}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {translating
                ? "Đang dịch…"
                : !hasAnyRow
                  ? "Generate EN + ZH"
                  : missingLocales.length > 0
                    ? `Generate ${missingLocales.map((l) => l.toUpperCase()).join(" + ")}`
                    : "Re-translate cả EN + ZH"}
            </button>
            <span className="text-[11px] text-muted-foreground">
              gpt-4o-mini · ~2-4s · cost &lt; $0.001/call
            </span>
            {translateError ? (
              <span className="text-[11px] text-red-600">{translateError}</span>
            ) : null}
          </div>

          {/* Side-by-side body */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* VI source */}
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>🇻🇳 VI source</span>
                <span className="text-[10px] font-medium normal-case px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                  canonical
                </span>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">
                  Question
                </label>
                <textarea
                  readOnly
                  rows={3}
                  value={source.question}
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface-muted/40 text-sm text-foreground resize-y"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">Answer</label>
                <textarea
                  readOnly
                  rows={8}
                  value={source.answer}
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface-muted/40 text-sm text-foreground resize-y"
                />
              </div>
            </div>

            {/* EN + ZH columns */}
            {LOCALES.map((locale) => {
              const row = rows[locale];
              const e = edits[locale];
              const isStale = row?.status === "stale";
              const isFailed = row?.status === "failed";
              return (
                <div key={locale} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>
                        {LOCALE_FLAG[locale]} {locale.toUpperCase()}
                      </span>
                      <TranslationStatusBadge row={row} variant="compact" />
                    </div>
                  </div>

                  {/* Stale source-snapshot preview */}
                  {isStale && row?.source_snapshot ? (
                    <details className="rounded-md border border-amber-300 bg-amber-50 text-[11px] text-amber-900">
                      <summary className="px-2 py-1.5 cursor-pointer font-medium">
                        ⚠ VI source đã đổi từ lúc dịch — xem snapshot
                      </summary>
                      <pre className="px-2 py-1.5 whitespace-pre-wrap text-[11px] leading-snug max-h-40 overflow-y-auto border-t border-amber-300">
                        {row.source_snapshot}
                      </pre>
                    </details>
                  ) : null}

                  {loading && !row ? (
                    <div className="text-xs text-muted-foreground italic">Đang tải…</div>
                  ) : !row ? (
                    <div className="text-xs text-muted-foreground italic py-8 text-center border border-dashed border-border rounded-md">
                      Chưa có bản dịch — bấm Generate ở trên.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-foreground mb-1">
                          Question
                        </label>
                        <textarea
                          rows={3}
                          value={e.question}
                          onChange={(ev) => setEditField(locale, "question", ev.target.value)}
                          disabled={translating || isFailed}
                          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y disabled:bg-surface-muted disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-foreground mb-1">
                          Answer
                        </label>
                        <textarea
                          rows={8}
                          value={e.answer}
                          onChange={(ev) => setEditField(locale, "answer", ev.target.value)}
                          disabled={translating || isFailed}
                          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y disabled:bg-surface-muted disabled:opacity-60"
                        />
                      </div>

                      {/* Action row */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {e.dirty ? (
                          <button
                            onClick={() => onSaveEdits(locale)}
                            disabled={translating}
                            className="h-8 px-2.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            Save edits
                          </button>
                        ) : null}
                        {row.status !== "failed" ? (
                          <button
                            onClick={() => onApprove(locale)}
                            disabled={translating || e.dirty || row.status === "reviewed"}
                            className="h-8 px-2.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              row.status === "reviewed"
                                ? "Đã được Approve rồi"
                                : e.dirty
                                  ? "Save edits trước khi Approve"
                                  : "Approve cho landing serve"
                            }
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          onClick={() => onGenerate([locale])}
                          disabled={translating}
                          className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
                          title="Gọi AI dịch lại — overwrite bản hiện tại"
                        >
                          Re-translate
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ locale, id: row.id })}
                          disabled={translating}
                          className="h-8 px-2.5 rounded-md border border-border bg-surface text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                          title="Xóa hoàn toàn bản dịch — landing sẽ fallback i18n.tsx"
                        >
                          Delete
                        </button>
                      </div>

                      {row.ai_model ? (
                        <div className="text-[10px] text-muted-foreground">
                          {row.ai_model} · prompt {row.prompt_version ?? "?"} ·{" "}
                          {row.ai_generated_at
                            ? new Date(row.ai_generated_at * 1000).toLocaleString()
                            : "—"}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border bg-surface-muted/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Approved rows được public API serve. Draft / Stale / Failed luôn invisible với
              landing.
            </span>
            <button
              onClick={() => !translating && onOpenChange(false)}
              disabled={translating}
              className="h-8 px-3 rounded-md border border-border bg-background hover:bg-surface-muted disabled:opacity-50"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await onDelete(confirmDelete.locale);
        }}
        title={`Xóa bản dịch ${confirmDelete ? confirmDelete.locale.toUpperCase() : ""}?`}
        description="Bản dịch sẽ bị xóa hoàn toàn. Landing sẽ fallback về i18n.tsx static cho locale này. Bạn có thể Generate lại bất cứ lúc nào."
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}
