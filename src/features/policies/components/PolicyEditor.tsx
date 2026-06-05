import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import {
  upsertPolicyFn,
  type PolicyLocale,
  type PolicyMode,
  type PolicyRow,
  type PolicyTextBlock,
} from "@/features/policies/policies.actions";

interface Props {
  slug: string;
  locale: PolicyLocale;
  policy: PolicyRow | null;
  onSaved: () => void | Promise<void>;
}

type TextStyle = "blocks" | "markdown";

interface FormState {
  title: string;
  body_md: string;
  icon: string;
  mode: PolicyMode;
  textStyle: TextStyle;
  summary: string;
  position: number;
}

function parseTextBlocks(json: string | null): PolicyTextBlock[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((b): b is PolicyTextBlock => {
      return (
        b && typeof b === "object" &&
        ["normal", "warn", "info"].includes(b.type) &&
        typeof b.heading === "string" &&
        Array.isArray(b.content)
      );
    });
  } catch {
    return [];
  }
}

function fromPolicy(p: PolicyRow | null): FormState {
  const blocks = parseTextBlocks(p?.text_blocks_json ?? null);
  return {
    title: p?.title ?? "",
    body_md: p?.body_md ?? "",
    icon: p?.icon ?? "",
    mode: p?.mode ?? "text",
    textStyle: blocks.length > 0 ? "blocks" : "markdown",
    summary: p?.summary ?? "",
    position: p?.position ?? 99,
  };
}

function parseImageList(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function PolicyEditor({ slug, locale, policy, onSaved }: Props) {
  const upsert = useServerFn(upsertPolicyFn);
  const [form, setForm] = useState<FormState>(() => fromPolicy(policy));
  const [imageList, setImageList] = useState<string[]>(() => parseImageList(policy?.image_list_json ?? null));
  const [textBlocks, setTextBlocks] = useState<PolicyTextBlock[]>(() => parseTextBlocks(policy?.text_blocks_json ?? null));
  const [pending, setPending] = useState(false);

  // Warn when stored JSON failed to parse — parseTextBlocks/parseImageList
  // swallow the error and fall back to empty, so a corrupt blob renders blank
  // and a Save would silently overwrite the recoverable original with nothing.
  const [jsonWarning] = useState(() => {
    const blobs = [policy?.text_blocks_json, policy?.image_list_json];
    return blobs.some((s) => {
      if (!s) return false;
      try { JSON.parse(s); return false; } catch { return true; }
    });
  });

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function addImage() { setImageList((s) => [...s, ""]); }
  function updateImage(i: number, value: string) { setImageList((s) => s.map((x, idx) => (idx === i ? value : x))); }
  function removeImage(i: number) { setImageList((s) => s.filter((_, idx) => idx !== i)); }
  function moveImage(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= imageList.length) return;
    const next = [...imageList];
    [next[i], next[target]] = [next[target], next[i]];
    setImageList(next);
  }

  function addBlock() {
    setTextBlocks((s) => [...s, { type: "normal", heading: "", content: [""] }]);
  }
  function removeBlock(i: number) {
    setTextBlocks((s) => s.filter((_, idx) => idx !== i));
  }
  function moveBlock(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= textBlocks.length) return;
    const next = [...textBlocks];
    [next[i], next[target]] = [next[target], next[i]];
    setTextBlocks(next);
  }
  function updateBlockField<K extends keyof PolicyTextBlock>(i: number, key: K, val: PolicyTextBlock[K]) {
    setTextBlocks((s) => s.map((b, idx) => (idx === i ? { ...b, [key]: val } : b)));
  }
  function addBlockLine(i: number) {
    setTextBlocks((s) => s.map((b, idx) => (idx === i ? { ...b, content: [...b.content, ""] } : b)));
  }
  function updateBlockLine(i: number, lineIdx: number, val: string) {
    setTextBlocks((s) =>
      s.map((b, idx) =>
        idx === i ? { ...b, content: b.content.map((c, ci) => (ci === lineIdx ? val : c)) } : b,
      ),
    );
  }
  function removeBlockLine(i: number, lineIdx: number) {
    setTextBlocks((s) =>
      s.map((b, idx) => (idx === i ? { ...b, content: b.content.filter((_, ci) => ci !== lineIdx) } : b)),
    );
  }

  async function save() {
    if (!form.title.trim()) { toast.error("Tiêu đề không được rỗng"); return; }
    setPending(true);
    try {
      const useBlocks = form.mode === "text" && form.textStyle === "blocks";
      const cleanedBlocks = useBlocks
        ? textBlocks
            .map((b) => ({
              type: b.type,
              heading: b.heading.trim(),
              content: b.content.map((c) => c.trim()).filter(Boolean),
            }))
            .filter((b) => b.heading || b.content.length > 0)
        : null;
      await upsert({
        data: {
          slug,
          locale,
          title: form.title.trim(),
          body_md: useBlocks ? "" : form.body_md,
          icon: form.icon.trim() || null,
          mode: form.mode,
          image_list: imageList.map((u) => u.trim()).filter(Boolean),
          text_blocks: cleanedBlocks,
          summary: form.summary.trim() || null,
          position: form.position,
        },
      });
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
          ⚠ Một số dữ liệu JSON đã lưu (khối nội dung/danh sách ảnh) bị lỗi định dạng và không đọc được — phần đó đang hiển thị trống. Nếu bạn bấm Lưu, dữ liệu gốc sẽ bị ghi đè. Hãy kiểm tra kỹ trước khi lưu.
        </div>
      ) : null}
      <div className="grid xl:grid-cols-2 gap-6 p-5">
        <div className="space-y-3.5">
          <CardHeader title="Thông tin chính" />
          <Field label="Tiêu đề" required>
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Icon (emoji hoặc tên tiktok)">
            <input type="text" value={form.icon} onChange={(e) => set("icon", e.target.value)} maxLength={50} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="📦 hoặc tiktok" />
          </Field>
          <Field label="Mô tả ngắn — hiện trên menu chọn chính sách">
            <textarea rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} maxLength={2000} className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
          </Field>
          <Field label="Thứ tự hiển thị">
            <input type="number" min={0} value={form.position} onChange={(e) => set("position", Number(e.target.value))} className="w-24 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>

          <CardHeader title="Cách hiển thị" hint="Ảnh: dùng cho chính sách scan (Tiếng Việt). Văn bản: dùng cho bản dịch English / 中文." />
          <div className="flex gap-2">
            {(["text", "image"] as const).map((m) => (
              <button key={m} type="button" onClick={() => set("mode", m)} className={`h-9 px-3 rounded-lg text-sm font-medium transition ${form.mode === m ? "bg-foreground text-background" : "border border-border bg-surface text-foreground hover:bg-surface-muted"}`}>{m === "text" ? "📝 Văn bản" : "🖼️ Ảnh scan"}</button>
            ))}
          </div>

          {form.mode === "text" && (
            <>
              <Field label="Kiểu hiển thị nội dung">
                <div className="flex gap-2">
                  {(["blocks", "markdown"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("textStyle", s)}
                      className={`h-8 px-3 rounded-md text-xs font-medium transition ${form.textStyle === s ? "bg-foreground text-background" : "border border-border bg-surface text-foreground hover:bg-surface-muted"}`}
                    >
                      {s === "blocks" ? "📋 Khối có tiêu đề" : "✏️ Markdown thuần"}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {form.textStyle === "blocks"
                    ? "Mỗi khối có 1 tiêu đề + nhiều dòng nội dung. Phù hợp chính sách dạng I, II, III…"
                    : "Toàn bộ nội dung là 1 đoạn markdown duy nhất."}
                </div>
              </Field>

              {form.textStyle === "markdown" && (
                <Field label="Nội dung chính sách">
                  <textarea rows={12} value={form.body_md} onChange={(e) => set("body_md", e.target.value)} maxLength={50000} className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed" />
                </Field>
              )}
            </>
          )}
        </div>

        {form.mode === "text" && form.textStyle === "blocks" && (
          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <CardHeader title={`Khối nội dung (${textBlocks.length})`} hint="Mỗi khối có 1 tiêu đề và danh sách dòng. Loại khối: bình thường / cảnh báo (vàng) / thông tin (xanh)." />
              <button type="button" onClick={addBlock} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface text-xs hover:bg-surface-muted">
                <Plus className="w-3 h-3" /> Thêm khối
              </button>
            </div>
            {textBlocks.length === 0 ? (
              <div className="text-sm text-muted-foreground italic px-1">Chưa có khối nào. Bấm "Thêm khối" để bắt đầu.</div>
            ) : (
              <ul className="space-y-3">
                {textBlocks.map((b, i) => (
                  <li key={i} className="p-3 rounded-md border border-border bg-surface-muted/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ChevronUp className="w-3 h-3" /></button>
                        <button type="button" onClick={() => moveBlock(i, +1)} disabled={i === textBlocks.length - 1} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ChevronDown className="w-3 h-3" /></button>
                      </div>
                      <select
                        value={b.type}
                        onChange={(e) => updateBlockField(i, "type", e.target.value as PolicyTextBlock["type"])}
                        className="h-7 px-2 rounded border border-input bg-background text-xs"
                      >
                        <option value="normal">Bình thường</option>
                        <option value="info">Thông tin (xanh)</option>
                        <option value="warn">Cảnh báo (vàng)</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Tiêu đề khối (vd: I. Địa chỉ kho)"
                        value={b.heading}
                        onChange={(e) => updateBlockField(i, "heading", e.target.value)}
                        maxLength={500}
                        className="flex-1 h-7 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button type="button" onClick={() => removeBlock(i)} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="space-y-1.5 pl-8">
                      {b.content.map((line, ci) => (
                        <div key={ci} className="flex gap-1.5">
                          <span className="text-[11px] text-muted-foreground mt-1.5 select-none">•</span>
                          <textarea
                            rows={Math.min(4, Math.max(1, Math.ceil(line.length / 80)))}
                            placeholder="Một dòng nội dung..."
                            value={line}
                            onChange={(e) => updateBlockLine(i, ci, e.target.value)}
                            maxLength={2000}
                            className="flex-1 px-2 py-1 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                          />
                          <button type="button" onClick={() => removeBlockLine(i, ci)} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 self-start mt-0.5"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addBlockLine(i)} className="inline-flex items-center gap-1 h-6 px-2 rounded border border-border bg-surface text-[11px] text-muted-foreground hover:bg-surface-muted">
                        <Plus className="w-3 h-3" /> Thêm dòng
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {form.mode === "image" && (
          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <CardHeader title={`Ảnh chính sách (${imageList.length})`} />
              <button type="button" onClick={addImage} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface text-xs hover:bg-surface-muted">
                <Plus className="w-3 h-3" /> Thêm ảnh
              </button>
            </div>
            {imageList.length === 0 ? (
              <div className="text-sm text-muted-foreground italic px-1">Chưa có ảnh nào.</div>
            ) : (
              <ul className="space-y-2">
                {imageList.map((url, idx) => (
                  <li key={idx} className="flex gap-2 p-2 rounded-md border border-border bg-surface-muted/30">
                    <div className="flex flex-col gap-0.5 mt-1">
                      <button type="button" onClick={() => moveImage(idx, -1)} disabled={idx === 0} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ChevronUp className="w-3 h-3" /></button>
                      <button type="button" onClick={() => moveImage(idx, +1)} disabled={idx === imageList.length - 1} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ChevronDown className="w-3 h-3" /></button>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input type="url" placeholder="https://...image.jpg" value={url} onChange={(e) => updateImage(idx, e.target.value)} maxLength={2000} className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                      {url && <img src={url} alt="" className="w-full max-h-32 object-cover rounded" referrerPolicy="no-referrer" />}
                    </div>
                    <button type="button" onClick={() => removeImage(idx)} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50 self-start"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface-muted/40 px-5 py-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Đang chỉnh sửa bản dịch: <span className="font-medium text-foreground">{locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}</span>.</div>
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
