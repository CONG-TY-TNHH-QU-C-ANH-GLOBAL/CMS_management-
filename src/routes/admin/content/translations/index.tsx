import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  deleteTranslationFn,
  listAllTranslationsFn,
  upsertTranslationFn,
  type TranslationRow,
} from "@/features/i18n/i18n.actions";

type Locale = "en" | "vi" | "zh";
const LOCALES: Locale[] = ["en", "vi", "zh"];

export const Route = createFileRoute("/admin/content/translations/")({
  head: () => ({ meta: [{ title: "UI Translations — THG Content OS" }] }),
  loader: () => listAllTranslationsFn(),
  component: TranslationsPage,
});

interface KeyGroup {
  key: string;
  values: Record<Locale, string | undefined>;
}

function groupByKey(rows: TranslationRow[]): KeyGroup[] {
  const map = new Map<string, KeyGroup>();
  for (const r of rows) {
    let g = map.get(r.key);
    if (!g) {
      g = { key: r.key, values: { en: undefined, vi: undefined, zh: undefined } };
      map.set(r.key, g);
    }
    if (r.locale === "en" || r.locale === "vi" || r.locale === "zh") {
      g.values[r.locale] = r.value;
    }
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function TranslationsPage() {
  const data = Route.useLoaderData() as TranslationRow[];
  const router = useRouter();
  const upsert = useServerFn(upsertTranslationFn);
  const del = useServerFn(deleteTranslationFn);

  const [filter, setFilter] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<Locale, string>>({ en: "", vi: "", zh: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<KeyGroup | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");

  const groups = useMemo(() => groupByKey(data), [data]);

  // Distinct prefixes (chars before first dot) for the filter chip bar.
  const prefixes = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      const dot = g.key.indexOf(".");
      if (dot > 0) set.add(g.key.slice(0, dot));
    }
    return [...set].sort();
  }, [groups]);

  const filtered = useMemo(() => {
    if (!filter) return groups;
    return groups.filter((g) => g.key.startsWith(`${filter}.`) || g.key.includes(filter));
  }, [groups, filter]);

  function startEdit(g: KeyGroup) {
    setEditingKey(g.key);
    setDrafts({
      en: g.values.en ?? "",
      vi: g.values.vi ?? "",
      zh: g.values.zh ?? "",
    });
  }

  function cancelEdit() {
    setEditingKey(null);
    setDrafts({ en: "", vi: "", zh: "" });
  }

  async function saveEdit(g: KeyGroup) {
    setSaving(true);
    try {
      // Upsert each locale that changed.
      for (const loc of LOCALES) {
        const before = g.values[loc] ?? "";
        const after = drafts[loc];
        if (before === after) continue;
        if (after.trim().length === 0) {
          // Empty value = delete the row (landing falls back to static i18n.tsx)
          if (g.values[loc] !== undefined) {
            await del({ data: { key: g.key, locale: loc } });
          }
          continue;
        }
        await upsert({ data: { key: g.key, locale: loc, value: after } });
      }
      toast.success(`Đã lưu ${g.key}`);
      cancelEdit();
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      for (const loc of LOCALES) {
        if (confirmDelete.values[loc] !== undefined) {
          await del({ data: { key: confirmDelete.key, locale: loc } });
        }
      }
      toast.success(`Đã xóa key ${confirmDelete.key}`);
      setConfirmDelete(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function addNewKey() {
    const key = newKey.trim();
    if (!key) return;
    if (groups.some((g) => g.key === key)) {
      toast.error("Key đã tồn tại");
      return;
    }
    // Create a placeholder draft on the new key — operator fills locales next.
    setShowAdd(false);
    setNewKey("");
    startEdit({ key, values: { en: undefined, vi: undefined, zh: undefined } });
    // No DB writes here — the row only commits when operator hits Save with
    // at least one non-empty locale value.
  }

  // Show the new-key draft in the table even though no row exists yet.
  const displayList: KeyGroup[] = useMemo(() => {
    if (editingKey && !groups.some((g) => g.key === editingKey)) {
      return [{ key: editingKey, values: { en: undefined, vi: undefined, zh: undefined } }, ...filtered];
    }
    return filtered;
  }, [filtered, editingKey, groups]);

  return (
    <>
      <CmsTopbar
        title="UI Translations"
        subtitle={`${groups.length} key đang ở DB. Override landing's static i18n.tsx fallback. Empty value = xóa row.`}
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm key
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          {/* Filter bar */}
          <div className="px-4 py-3 border-b border-border space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Lọc theo prefix hoặc substring (vd: nav, hero.title)"
                className="flex-1 h-8 px-2.5 rounded-md border border-input bg-background text-xs"
              />
              {filter ? (
                <button
                  onClick={() => setFilter("")}
                  className="h-8 px-2 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {prefixes.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground font-medium">Prefix:</span>
                {prefixes.map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilter(filter === p ? "" : p)}
                    className={`h-6 px-2 rounded-md border text-[11px] ${filter === p ? "bg-foreground text-background border-foreground" : "border-border bg-surface hover:bg-surface-muted"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Add-key inline form */}
          {showAdd ? (
            <div className="px-4 py-3 border-b border-border bg-blue-50 flex items-center gap-2">
              <input
                autoFocus
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addNewKey();
                  if (e.key === "Escape") {
                    setShowAdd(false);
                    setNewKey("");
                  }
                }}
                placeholder="vd: nav.new_link"
                className="flex-1 h-8 px-2.5 rounded-md border border-input bg-background text-xs font-mono"
              />
              <button
                onClick={addNewKey}
                className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90"
              >
                Tạo
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setNewKey("");
                }}
                className="h-8 px-3 rounded-md border border-border bg-background text-xs hover:bg-surface-muted"
              >
                Hủy
              </button>
            </div>
          ) : null}

          {/* List */}
          <div className="divide-y divide-border">
            {displayList.length === 0 ? (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">
                {filter ? `Không có key match "${filter}".` : "DB translations rỗng — bấm 'Thêm key' để override một i18n.tsx key."}
              </div>
            ) : null}
            {displayList.map((g) => {
              const isEditing = editingKey === g.key;
              return (
                <div key={g.key} className="px-4 py-3 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-xs text-foreground font-medium min-w-0 flex-1 pt-1.5">
                      {g.key}
                    </div>
                    {!isEditing ? (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          onClick={() => startEdit(g)}
                          className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs hover:bg-surface-muted"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => setConfirmDelete(g)}
                          className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                          title="Xóa cả 3 locale"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => saveEdit(g)}
                          disabled={saving}
                          className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? "Đang lưu…" : "Lưu"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="h-8 px-2.5 rounded-md border border-border bg-background text-xs hover:bg-surface-muted disabled:opacity-50"
                        >
                          Hủy
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                    {LOCALES.map((loc) => (
                      <div key={loc}>
                        <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                          {loc === "en" ? "🇺🇸 EN" : loc === "vi" ? "🇻🇳 VI" : "🇨🇳 ZH"}
                          {g.values[loc] === undefined ? (
                            <span className="ml-1 text-amber-600 normal-case font-normal">
                              · falls back to i18n.tsx
                            </span>
                          ) : null}
                        </label>
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={drafts[loc]}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [loc]: e.target.value }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                          />
                        ) : (
                          <div className="px-2.5 py-1.5 rounded-md border border-border bg-surface-muted/40 text-xs text-foreground min-h-[2.25rem] whitespace-pre-wrap">
                            {g.values[loc] ?? (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </PageContainer>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Xóa key ${confirmDelete?.key}?`}
        description="Sẽ xóa cả 3 locale của key này. Landing fallback về i18n.tsx static cho key này."
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}
