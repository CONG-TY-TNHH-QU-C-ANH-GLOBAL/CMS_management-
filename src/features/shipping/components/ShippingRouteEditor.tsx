import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import {
  replaceShippingTablesFn,
  upsertShippingRouteFn,
  type ShippingLocale,
  type ShippingRouteRow,
  type ShippingStatus,
  type ShippingTableRow,
} from "@/features/shipping/shipping.actions";

interface Props {
  slug: string;
  locale: ShippingLocale;
  route: ShippingRouteRow | null;
  tables: ShippingTableRow[];
  onSaved: () => void | Promise<void>;
}

interface FormState {
  title: string;
  origin: string;
  destination: string;
  kind: string;
  body_md: string;
  status: ShippingStatus;
  position: number;
  notes_text: string;
}

interface TableInput {
  caption: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
}

function fromRoute(r: ShippingRouteRow | null): FormState {
  let notes: string[] = [];
  try { notes = r?.notes_json ? JSON.parse(r.notes_json) : []; } catch {}
  return {
    title: r?.title ?? "",
    origin: r?.origin ?? "",
    destination: r?.destination ?? "",
    kind: r?.kind ?? "",
    body_md: r?.body_md ?? "",
    status: r?.status ?? "live",
    position: r?.position ?? 99,
    notes_text: notes.join("\n"),
  };
}

function fromTables(rows: ShippingTableRow[]): TableInput[] {
  return rows.map((r) => {
    let columns: Array<{ key: string; label: string }> = [];
    let rowsData: Array<Record<string, string>> = [];
    try { columns = JSON.parse(r.columns_json); } catch {}
    try {
      const raw = JSON.parse(r.rows_json);
      rowsData = (Array.isArray(raw) ? raw : []).map((rr: Record<string, unknown>) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(rr)) out[k] = v == null ? "" : String(v);
        return out;
      });
    } catch {}
    return { caption: r.caption ?? "", columns, rows: rowsData };
  });
}

export function ShippingRouteEditor({ slug, locale, route, tables, onSaved }: Props) {
  const upsert = useServerFn(upsertShippingRouteFn);
  const replaceTables = useServerFn(replaceShippingTablesFn);
  const [form, setForm] = useState<FormState>(() => fromRoute(route));
  const [tableList, setTableList] = useState<TableInput[]>(() => fromTables(tables));
  const [pending, setPending] = useState(false);

  // Detect stored JSON that failed to parse. fromRoute/fromTables swallow parse
  // errors and fall back to empty, so a corrupt blob would render blank and a
  // Save would silently overwrite the (recoverable) original with nothing. Warn
  // the operator so they don't clobber it.
  const [jsonWarning] = useState(() => {
    const blobs = [route?.notes_json, ...tables.flatMap((t) => [t.columns_json, t.rows_json])];
    return blobs.some((s) => {
      if (!s) return false;
      try { JSON.parse(s); return false; } catch { return true; }
    });
  });

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  // ─── table editing helpers ───
  function addTable() {
    setTableList((s) => [...s, { caption: "", columns: [{ key: "weight", label: "Cân nặng" }, { key: "price", label: "Giá ($)" }], rows: [] }]);
  }
  function removeTable(idx: number) { setTableList((s) => s.filter((_, i) => i !== idx)); }
  function moveTable(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= tableList.length) return;
    const next = [...tableList];
    [next[idx], next[target]] = [next[target], next[idx]];
    setTableList(next);
  }
  function updateTableCaption(tIdx: number, caption: string) {
    setTableList((s) => s.map((t, i) => (i === tIdx ? { ...t, caption } : t)));
  }
  function addColumn(tIdx: number) {
    setTableList((s) => s.map((t, i) => i === tIdx ? { ...t, columns: [...t.columns, { key: `col_${t.columns.length + 1}`, label: "" }] } : t));
  }
  function removeColumn(tIdx: number, cIdx: number) {
    setTableList((s) => s.map((t, i) => {
      if (i !== tIdx) return t;
      const removedKey = t.columns[cIdx].key;
      return {
        ...t,
        columns: t.columns.filter((_, k) => k !== cIdx),
        rows: t.rows.map((r) => { const c = { ...r }; delete c[removedKey]; return c; }),
      };
    }));
  }
  function updateColumn(tIdx: number, cIdx: number, patch: Partial<{ key: string; label: string }>) {
    setTableList((s) => s.map((t, i) => i === tIdx ? {
      ...t,
      columns: t.columns.map((c, k) => k === cIdx ? { ...c, ...patch } : c),
    } : t));
  }
  function addRow(tIdx: number) {
    setTableList((s) => s.map((t, i) => {
      if (i !== tIdx) return t;
      const empty: Record<string, string> = {};
      for (const c of t.columns) empty[c.key] = "";
      return { ...t, rows: [...t.rows, empty] };
    }));
  }
  function removeRow(tIdx: number, rIdx: number) {
    setTableList((s) => s.map((t, i) => i === tIdx ? { ...t, rows: t.rows.filter((_, r) => r !== rIdx) } : t));
  }
  function updateCell(tIdx: number, rIdx: number, key: string, val: string) {
    setTableList((s) => s.map((t, i) => i === tIdx ? {
      ...t,
      rows: t.rows.map((r, k) => k === rIdx ? { ...r, [key]: val } : r),
    } : t));
  }

  async function save() {
    if (!form.title.trim()) { toast.error("Tiêu đề không được rỗng"); return; }
    setPending(true);
    try {
      const notes = form.notes_text.split("\n").map((s) => s.trim()).filter(Boolean);
      await upsert({
        data: {
          slug,
          locale,
          title: form.title.trim(),
          origin: form.origin.trim() || null,
          destination: form.destination.trim() || null,
          kind: form.kind.trim() || null,
          body_md: form.body_md.trim() || null,
          notes,
          status: form.status,
          position: form.position,
        },
      });
      // Store cell values verbatim as strings (empty → null). The old code
      // coerced "parseable" cells to numbers, but a price like "1.234" (VN
      // thousands for 1234) parsed to the number 1.234 — a silent 1000×
      // corruption. There's no reliable way to tell decimal-dot from
      // thousands-dot, and the public renderer only does String(cell), so
      // keeping the operator's exact text both avoids the bug and preserves
      // their formatting (grouping separators, units, "Thoả thuận", etc.).
      const tablesPayload = tableList.map((t) => ({
        caption: t.caption.trim() || null,
        columns: t.columns,
        rows: t.rows.map((r) => {
          const out: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(r)) {
            out[k] = v === "" ? null : v;
          }
          return out;
        }),
      }));
      await replaceTables({ data: { slug, locale, tables: tablesPayload } });
      toast.success(`Đã lưu bản dịch ${locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      {jsonWarning ? (
        <div className="border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
          ⚠ Một số dữ liệu JSON đã lưu (ghi chú/bảng giá) bị lỗi định dạng và không đọc được — phần đó đang hiển thị trống. Nếu bạn bấm Lưu, dữ liệu gốc sẽ bị ghi đè. Hãy kiểm tra kỹ trước khi lưu.
        </div>
      ) : null}
      <div className="grid xl:grid-cols-2 gap-6 p-5">
        <div className="space-y-3.5">
          <CardHeader title="Thông tin tuyến vận chuyển" />
          <Field label="Tiêu đề" required>
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Origin">
              <input type="text" value={form.origin} onChange={(e) => set("origin", e.target.value)} maxLength={50} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="VN" />
            </Field>
            <Field label="Destination">
              <input type="text" value={form.destination} onChange={(e) => set("destination", e.target.value)} maxLength={50} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="US" />
            </Field>
            <Field label="Kind">
              <input type="text" value={form.kind} onChange={(e) => set("kind", e.target.value)} maxLength={100} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="regular" />
            </Field>
          </div>
          <Field label="Mô tả chi tiết — điều kiện, quy tắc, lưu ý vận hành">
            <textarea rows={8} value={form.body_md} onChange={(e) => set("body_md", e.target.value)} maxLength={200000} className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed" />
          </Field>
          <Field label="Lưu ý quan trọng — mỗi dòng 1 lưu ý">
            <textarea rows={3} value={form.notes_text} onChange={(e) => set("notes_text", e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-y" placeholder="Lưu ý 1&#10;Lưu ý 2" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Position">
              <input type="number" min={0} value={form.position} onChange={(e) => set("position", Number(e.target.value))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value as ShippingStatus)} className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="live">Đang hiển thị</option><option value="draft">Bản nháp</option><option value="archived">Đã ẩn</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <CardHeader title={`Bảng giá (${tableList.length})`} />
            <button type="button" onClick={addTable} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface text-xs hover:bg-surface-muted">
              <Plus className="w-3 h-3" /> Thêm bảng
            </button>
          </div>
          {tableList.length === 0 ? (
            <div className="text-sm text-muted-foreground italic px-1">Chưa có bảng nào.</div>
          ) : (
            <div className="space-y-3">
              {tableList.map((t, tIdx) => (
                <div key={tIdx} className="rounded-lg border border-border bg-surface-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="text" value={t.caption} onChange={(e) => updateTableCaption(tIdx, e.target.value)} placeholder="Tên bảng (vd: Bảng giá theo cân)" className="flex-1 h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                    <button type="button" onClick={() => moveTable(tIdx, -1)} disabled={tIdx === 0} className="grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ChevronUp className="w-3 h-3" /></button>
                    <button type="button" onClick={() => moveTable(tIdx, +1)} disabled={tIdx === tableList.length - 1} className="grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ChevronDown className="w-3 h-3" /></button>
                    <button type="button" onClick={() => removeTable(tIdx)} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"><Trash2 className="w-3 h-3" /></button>
                  </div>

                  {/* Columns editor */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Columns</span>
                      <button type="button" onClick={() => addColumn(tIdx)} className="text-[10px] text-primary hover:underline">+ col</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.columns.map((c, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-1 bg-background border border-border rounded px-1">
                          <input type="text" value={c.key} onChange={(e) => updateColumn(tIdx, cIdx, { key: e.target.value })} className="w-16 h-6 px-1 text-[10px] font-mono bg-transparent focus:outline-none" placeholder="mã cột" />
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <input type="text" value={c.label} onChange={(e) => updateColumn(tIdx, cIdx, { label: e.target.value })} className="w-24 h-6 px-1 text-[10px] bg-transparent focus:outline-none" placeholder="tiêu đề cột" />
                          <button type="button" onClick={() => removeColumn(tIdx, cIdx)} className="text-muted-foreground hover:text-red-600 text-[10px]">×</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rows editor (table) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Rows ({t.rows.length})</span>
                      <button type="button" onClick={() => addRow(tIdx)} className="text-[10px] text-primary hover:underline">+ row</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-[11px] w-full border-collapse">
                        <thead>
                          <tr>
                            {t.columns.map((c) => <th key={c.key} className="text-left px-1 py-0.5 font-mono text-[10px]">{c.label || c.key}</th>)}
                            <th className="w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.rows.map((r, rIdx) => (
                            <tr key={rIdx} className="border-t border-border">
                              {t.columns.map((c) => (
                                <td key={c.key} className="px-0.5 py-0.5">
                                  <input type="text" value={r[c.key] ?? ""} onChange={(e) => updateCell(tIdx, rIdx, c.key, e.target.value)} className="w-full h-6 px-1 text-[11px] bg-transparent border border-transparent hover:border-border focus:border-ring focus:outline-none rounded" />
                                </td>
                              ))}
                              <td className="px-0.5">
                                <button type="button" onClick={() => removeRow(tIdx, rIdx)} className="text-muted-foreground hover:text-red-600 text-[10px]">×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-surface-muted/40 px-5 py-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Đang chỉnh sửa bản dịch: <span className="font-medium text-foreground">{locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}</span> + bảng giá tương ứng.</div>
        <button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </Card>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>
      {children}
    </div>
  );
}
