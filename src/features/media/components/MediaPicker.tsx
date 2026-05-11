// Reusable media picker dialog. Used by ServiceEditor (gallery + products),
// blog editor (thumbnail), policy editor (image list), etc.
//
// Usage:
//   <MediaPicker
//     mode="single" | "multi"
//     value={media_ids}        // current selection (number[] or null)
//     onChange={(ids, rows) => …}
//     trigger={<Button>Chọn ảnh</Button>}
//   />

import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/cms/ui";
import {
  listMediaFn,
  type MediaRow,
} from "@/features/media/media.actions";

type PickerMode = "single" | "multi";

interface Props {
  mode: PickerMode;
  value: number[];
  onChange: (ids: number[], rows: MediaRow[]) => void;
  trigger: React.ReactNode;
  /** Default tag filter when picker opens. */
  defaultTag?: string | null;
  /** Title shown in picker header. */
  title?: string;
}

const PAGE_SIZE = 24;

export function MediaPicker({ mode, value, onChange, trigger, defaultTag, title }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState<string | null>(defaultTag ?? null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>(value);
  const [pending, setPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Reset selection when external value changes
  useEffect(() => { setSelected(value); }, [value]);

  async function load(nextTag = tag, nextSearch = search) {
    setPending(true);
    try {
      const data = await listMediaFn({
        data: { limit: PAGE_SIZE, tag: nextTag ?? undefined, search: nextSearch || undefined },
      });
      setRows(data.rows);
      setTags(data.tags);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (open) load(tag, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(id: number) {
    if (mode === "single") {
      setSelected([id]);
    } else {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    }
  }

  function confirm() {
    const picked = rows.filter((r) => selected.includes(r.id));
    onChange(selected, picked);
    setOpen(false);
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadPending(true);
    try {
      let okCount = 0;
      const newRows: MediaRow[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("alt_text", file.name);
        if (tag) fd.append("tag", tag);
        const res = await fetch("/api/v1/media/upload", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
          toast.error(`Tải lên thất bại: ${file.name} — ${err.error ?? res.status}`);
          continue;
        }
        const { media } = (await res.json()) as { media: MediaRow };
        newRows.push(media);
        okCount++;
      }
      if (okCount > 0) {
        toast.success(`Đã tải lên ${okCount} ảnh`);
        await load(tag, search);
        // Auto-select newly uploaded
        const newIds = newRows.map((r) => r.id);
        if (mode === "single") {
          if (newIds.length > 0) setSelected([newIds[0]]);
        } else {
          setSelected((s) => [...s, ...newIds]);
        }
      }
    } finally {
      setUploadPending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="rounded-xl border border-border bg-background shadow-elevated max-w-5xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="font-semibold">{title ?? (mode === "single" ? "Chọn 1 ảnh" : "Chọn nhiều ảnh")}</div>
              <button onClick={() => setOpen(false)} className="grid place-items-center w-8 h-8 rounded-md hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter + search + upload */}
            <div className="px-5 py-3 border-b border-border space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setTag(null); load(null, search); }}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition ${tag === null ? "bg-foreground text-background" : "border border-border bg-surface hover:bg-surface-muted"}`}
                >
                  Tất cả
                </button>
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTag(t); load(t, search); }}
                    className={`h-7 px-2.5 rounded-md text-xs font-medium font-mono transition ${tag === t ? "bg-foreground text-background" : "border border-border bg-surface hover:bg-surface-muted"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") load(tag, e.currentTarget.value); }}
                    placeholder="Tìm ảnh…"
                    className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  multiple={mode === "multi"}
                  accept="image/*,video/mp4,video/webm"
                  className="hidden"
                  onChange={(e) => onUploadFiles(e.target.files)}
                  disabled={uploadPending}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploadPending}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
                >
                  {uploadPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Tải lên
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-5">
              {pending && rows.length === 0 ? (
                <div className="grid place-items-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  Không tìm thấy ảnh nào. Hãy tải lên ảnh đầu tiên.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {rows.map((m) => {
                    const isSel = selected.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        className={`text-left rounded-lg border-2 overflow-hidden cursor-pointer transition relative ${isSel ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"}`}
                      >
                        <div className="aspect-square relative bg-muted">
                          {m.mime.startsWith("image/") && m.url ? (
                            <img src={m.url} alt={m.alt_text} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="absolute inset-0 grid place-items-center text-muted-foreground text-[10px]">{m.mime}</div>
                          )}
                          {isSel && (
                            <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary text-white grid place-items-center">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="p-1.5">
                          <div className="text-[10px] truncate font-medium">{m.title || m.r2_key.split("/").pop()}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-surface-muted/40">
              <div className="text-xs text-muted-foreground">
                {selected.length} ảnh đã chọn
                {mode === "single" && selected.length > 1 ? " (chỉ giữ ảnh đầu)" : ""}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="h-9 px-3 rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-muted">
                  Hủy
                </button>
                <button
                  onClick={confirm}
                  disabled={selected.length === 0}
                  className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  Dùng {selected.length > 0 ? `(${selected.length})` : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
