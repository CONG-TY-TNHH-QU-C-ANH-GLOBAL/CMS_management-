import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import {
  getSiteSettingsFn,
  saveTerminologyFn,
  type SiteSettingsRow,
} from "@/features/settings/settings.actions";

type Localized = { vi: string; en: string; zh: string };
type Term = { term: Localized; desc: Localized };
type Group = { title: Localized; terms: Term[] };

const emptyLocalized = (): Localized => ({ vi: "", en: "", zh: "" });
const emptyTerm = (): Term => ({ term: emptyLocalized(), desc: emptyLocalized() });
const emptyGroup = (): Group => ({ title: emptyLocalized(), terms: [emptyTerm()] });

function parseGroups(raw: string | null | undefined): Group[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v as Group[];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/admin/sales/terminology/")({
  head: () => ({ meta: [{ title: "Bảng thuật ngữ — THG Content OS" }] }),
  loader: () => getSiteSettingsFn(),
  component: TerminologyPage,
});

function TerminologyPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveTerminologyFn);
  const settings = data.settings as SiteSettingsRow | null;
  const initial = useMemo(() => parseGroups(settings?.terminology_json), [settings?.terminology_json]);

  const [groups, setGroups] = useState<Group[]>(initial);
  const [pending, setPending] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const isDirty = useMemo(() => JSON.stringify(groups) !== JSON.stringify(initial), [groups, initial]);

  function moveGroup(idx: number, dir: -1 | 1) {
    const next = [...groups];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setGroups(next);
  }

  function addGroup() {
    setGroups([...groups, emptyGroup()]);
  }

  function deleteGroup(idx: number) {
    if (!confirm("Xoá cả nhóm này?")) return;
    setGroups(groups.filter((_, i) => i !== idx));
  }

  function updateGroupTitle(idx: number, lang: keyof Localized, val: string) {
    const next = [...groups];
    next[idx] = { ...next[idx], title: { ...next[idx].title, [lang]: val } };
    setGroups(next);
  }

  function addTerm(gi: number) {
    const next = [...groups];
    next[gi] = { ...next[gi], terms: [...next[gi].terms, emptyTerm()] };
    setGroups(next);
  }

  function deleteTerm(gi: number, ti: number) {
    if (!confirm("Xoá thuật ngữ này?")) return;
    const next = [...groups];
    next[gi] = { ...next[gi], terms: next[gi].terms.filter((_, i) => i !== ti) };
    setGroups(next);
  }

  function moveTerm(gi: number, ti: number, dir: -1 | 1) {
    const next = [...groups];
    const terms = [...next[gi].terms];
    const target = ti + dir;
    if (target < 0 || target >= terms.length) return;
    [terms[ti], terms[target]] = [terms[target], terms[ti]];
    next[gi] = { ...next[gi], terms };
    setGroups(next);
  }

  function updateTerm(gi: number, ti: number, field: "term" | "desc", lang: keyof Localized, val: string) {
    const next = [...groups];
    const terms = [...next[gi].terms];
    terms[ti] = { ...terms[ti], [field]: { ...terms[ti][field], [lang]: val } };
    next[gi] = { ...next[gi], terms };
    setGroups(next);
  }

  async function handleSave() {
    setPending(true);
    try {
      await save({ data: { groups } });
      toast.success("Đã lưu bảng thuật ngữ");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <CmsTopbar
        title="Bảng thuật ngữ"
        subtitle="Glossary hiển thị ở cuối trang Bảng giá quốc tế — Mỗi mục có 3 ngôn ngữ (vi/en/zh). Hỗ trợ HTML inline trong mô tả."
      />
      <PageContainer>
        <div className="pb-24 space-y-4">
          {groups.length === 0 && (
            <Card>
              <div className="p-10 text-center text-sm text-muted-foreground">
                Chưa có nhóm thuật ngữ nào. Nhấn "Thêm nhóm" để bắt đầu.
              </div>
            </Card>
          )}

          {groups.map((g, gi) => {
            const isCollapsed = collapsed[gi];
            return (
              <Card key={gi}>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-surface-muted/40">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveGroup(gi, -1)}
                      disabled={gi === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                      title="Di chuyển lên"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveGroup(gi, 1)}
                      disabled={gi === groups.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                      title="Di chuyển xuống"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                  <div className="flex-1 grid sm:grid-cols-3 gap-2">
                    <LocaleField label="🇻🇳 Tên nhóm (VI)" value={g.title.vi} onChange={(v) => updateGroupTitle(gi, "vi", v)} placeholder="VD: Vận chuyển" />
                    <LocaleField label="🇬🇧 EN" value={g.title.en} onChange={(v) => updateGroupTitle(gi, "en", v)} placeholder="Shipping" />
                    <LocaleField label="🇨🇳 ZH" value={g.title.zh} onChange={(v) => updateGroupTitle(gi, "zh", v)} placeholder="运输" />
                  </div>
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [gi]: !c[gi] }))}
                    className="text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-surface-muted"
                  >
                    {isCollapsed ? `Mở (${g.terms.length})` : "Thu gọn"}
                  </button>
                  <button
                    onClick={() => deleteGroup(gi)}
                    className="text-red-600 hover:bg-red-50 p-1.5 rounded-md"
                    title="Xoá nhóm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="p-4 space-y-3">
                    {g.terms.map((t, ti) => (
                      <div key={ti} className="rounded-lg border border-border bg-surface-muted/30 p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex flex-col">
                            <button
                              onClick={() => moveTerm(gi, ti, -1)}
                              disabled={ti === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveTerm(gi, ti, 1)}
                              disabled={ti === g.terms.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex-1">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                              Thuật ngữ — {ti + 1}/{g.terms.length}
                            </div>
                            <div className="grid sm:grid-cols-3 gap-2">
                              <LocaleField label="🇻🇳 VI" value={t.term.vi} onChange={(v) => updateTerm(gi, ti, "term", "vi", v)} />
                              <LocaleField label="🇬🇧 EN" value={t.term.en} onChange={(v) => updateTerm(gi, ti, "term", "en", v)} />
                              <LocaleField label="🇨🇳 ZH" value={t.term.zh} onChange={(v) => updateTerm(gi, ti, "term", "zh", v)} />
                            </div>
                          </div>
                          <button
                            onClick={() => deleteTerm(gi, ti)}
                            className="text-red-600 hover:bg-red-50 p-1.5 rounded-md"
                            title="Xoá thuật ngữ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-2 pl-7">
                          <LocaleArea label="🇻🇳 Mô tả VI" value={t.desc.vi} onChange={(v) => updateTerm(gi, ti, "desc", "vi", v)} />
                          <LocaleArea label="🇬🇧 EN" value={t.desc.en} onChange={(v) => updateTerm(gi, ti, "desc", "en", v)} />
                          <LocaleArea label="🇨🇳 ZH" value={t.desc.zh} onChange={(v) => updateTerm(gi, ti, "desc", "zh", v)} />
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => addTerm(gi)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-dashed border-border hover:bg-surface-muted text-muted-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm thuật ngữ
                    </button>
                  </div>
                )}
              </Card>
            );
          })}

          <button
            onClick={addGroup}
            className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-3 rounded-md border-2 border-dashed border-border hover:bg-surface-muted text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-4 h-4" /> Thêm nhóm mới
          </button>
        </div>

        {isDirty && (
          <div className="fixed bottom-0 right-0 lg:left-65 lg:right-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl p-3 shadow-elevated">
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Có thay đổi chưa lưu — {groups.length} nhóm, {groups.reduce((s, g) => s + g.terms.length, 0)} thuật ngữ
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setGroups(initial)}
                disabled={pending}
                className="h-9 px-3 rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                Hủy thay đổi
              </button>
              <button
                onClick={handleSave}
                disabled={pending}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-soft"
              >
                <Save className="w-4 h-4" /> {pending ? "Đang lưu…" : "Lưu bảng thuật ngữ"}
              </button>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}

function LocaleField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function LocaleArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-y"
      />
    </div>
  );
}
