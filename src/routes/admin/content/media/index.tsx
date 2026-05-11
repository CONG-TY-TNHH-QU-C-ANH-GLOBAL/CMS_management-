import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Folder, Trash2, Pencil, Copy, X, Loader2, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  listMediaFn,
  updateMediaMetaFn,
  deleteMediaFn,
  deleteAllMediaFn,
  type MediaRow,
} from "@/features/media/media.actions";

const PAGE_SIZE = 24;

export const Route = createFileRoute("/admin/content/media/")({
  head: () => ({ meta: [{ title: "Thư viện ảnh — THG Content OS" }] }),
  loader: () => listMediaFn({ data: { limit: PAGE_SIZE, offset: 0 } }),
  component: MediaPage,
});

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaPage() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const wipeAll = useServerFn(deleteAllMediaFn);
  const [rows, setRows] = useState<MediaRow[]>(initial.rows);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [total, setTotal] = useState<number>(initial.total);
  const [offset, setOffset] = useState(0);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MediaRow | null>(null);
  const [pending, setPending] = useState(false);
  const [wipeDialog, setWipeDialog] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalSizeStr = useMemo(() => {
    const bytes = rows.reduce((sum, r) => sum + r.bytes, 0);
    return formatBytes(bytes);
  }, [rows]);

  async function reload(nextOffset = offset, nextTag = tagFilter, nextSearch = search) {
    const data = await listMediaFn({
      data: {
        limit: PAGE_SIZE,
        offset: nextOffset,
        tag: nextTag ?? undefined,
        search: nextSearch || undefined,
      },
    });
    setRows(data.rows);
    setTags(data.tags);
    setTotal(data.total);
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPending(true);
    try {
      let okCount = 0;
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("alt_text", file.name);
        if (tagFilter) fd.append("tag", tagFilter);
        const res = await fetch("/api/v1/media/upload", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          toast.error(`Tải lên thất bại: ${file.name} — ${(err as { error?: string }).error ?? res.status}`);
          continue;
        }
        okCount++;
      }
      if (okCount > 0) {
        toast.success(`Đã tải lên ${okCount} ảnh`);
        await reload(0, tagFilter, search);
        setOffset(0);
      }
    } finally {
      setPending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <CmsTopbar
        title="Thư viện ảnh"
        subtitle={`${total} ảnh · ${totalSizeStr} trong trang này`}
        action={
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => onUploadFiles(e.target.files)}
              disabled={pending}
            />
            {total > 0 && (
              <button
                onClick={() => setWipeDialog(true)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 disabled:opacity-50"
                title="Xóa toàn bộ thư viện ảnh (KHÔNG hoàn tác)"
              >
                <AlertTriangle className="w-4 h-4" /> Xóa toàn bộ
              </button>
            )}
            <button
              onClick={() => fileInput.current?.click()}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Tải lên
            </button>
          </>
        }
      />
      <PageContainer>
        {/* Tag filter chips */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => {
              setTagFilter(null);
              setOffset(0);
              reload(0, null, search);
            }}
            className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm transition ${tagFilter === null ? "bg-foreground text-background" : "border border-border bg-surface hover:bg-surface-muted"}`}
          >
            <Folder className="w-4 h-4" /> Tất cả
            <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${tagFilter === null ? "bg-white/20" : "bg-muted text-muted-foreground"}`}>{total}</span>
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTagFilter(t);
                setOffset(0);
                reload(0, t, search);
              }}
              className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm transition ${tagFilter === t ? "bg-foreground text-background" : "border border-border bg-surface hover:bg-surface-muted"}`}
            >
              <ImageIcon className="w-4 h-4" />
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="search"
            placeholder="Tìm theo tên / chú thích / r2_key…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setOffset(0);
                reload(0, tagFilter, e.currentTarget.value);
              }
            }}
            className="w-full max-w-md h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Grid */}
        {rows.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted grid place-items-center mb-3">
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">Chưa có ảnh nào</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Bấm "Tải lên" để bắt đầu thêm ảnh. Định dạng hỗ trợ: JPG, PNG, WebP, MP4. Giới hạn 10MB/file.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {rows.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setEditing(m)}
                className="text-left rounded-xl border border-border bg-card shadow-soft overflow-hidden cursor-pointer group hover:border-primary/40 transition"
              >
                <div className="aspect-square relative bg-muted">
                  {m.mime.startsWith("image/") && m.url ? (
                    <img
                      src={m.url}
                      alt={m.alt_text || m.title || "media"}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs">
                      {m.mime}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-end p-2 opacity-0 group-hover:opacity-100">
                    <div className="text-[10px] text-white font-medium truncate w-full">
                      {m.title || m.r2_key.split("/").pop()}
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[11px] truncate font-medium">{m.title || m.r2_key.split("/").pop()}</div>
                  <div className="text-[10px] text-muted-foreground flex justify-between">
                    <span>{formatBytes(m.bytes)}</span>
                    {m.tag && <span className="font-mono">{m.tag}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 mt-5 text-sm">
            <div className="text-muted-foreground">
              {offset + 1} – {Math.min(offset + PAGE_SIZE, total)} / {total}
            </div>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => {
                  const next = Math.max(0, offset - PAGE_SIZE);
                  setOffset(next);
                  reload(next, tagFilter, search);
                }}
                className="h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted disabled:opacity-40"
              >
                ← Trước
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => {
                  const next = offset + PAGE_SIZE;
                  setOffset(next);
                  reload(next, tagFilter, search);
                }}
                className="h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted disabled:opacity-40"
              >
                Sau →
              </button>
            </div>
          </div>
        )}

        {/* Edit dialog */}
        {editing && (
          <MediaEditDialog
            media={editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              await reload(offset, tagFilter, search);
              setEditing(null);
            }}
            onDeleted={async () => {
              await reload(0, tagFilter, search);
              setOffset(0);
              setEditing(null);
            }}
          />
        )}

        {/* Wipe-all confirmation dialog */}
        {wipeDialog && (
          <WipeAllDialog
            total={total}
            onClose={() => setWipeDialog(false)}
            onConfirm={async () => {
              setPending(true);
              try {
                const { deleted } = await wipeAll({ data: { confirm: "XOA-TAT-CA" } });
                toast.success(`Đã xóa toàn bộ ${deleted} ảnh khỏi database + R2`);
                setWipeDialog(false);
                setOffset(0);
                await reload(0, null, "");
                setTagFilter(null);
                setSearch("");
                await router.invalidate();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Xóa thất bại");
              } finally {
                setPending(false);
              }
            }}
          />
        )}
      </PageContainer>
    </>
  );
}

function WipeAllDialog({
  total,
  onClose,
  onConfirm,
}: {
  total: number;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [pending, setPending] = useState(false);
  const matches = phrase.trim() === "XOA-TAT-CA";

  async function go() {
    if (!matches) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="rounded-xl border-2 border-rose-300 bg-background shadow-elevated max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-rose-50">
          <AlertTriangle className="w-5 h-5 text-rose-700" />
          <div className="font-semibold text-rose-900">Xóa toàn bộ thư viện ảnh</div>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p className="text-foreground">
            Hành động này sẽ xóa <strong className="text-rose-700">vĩnh viễn {total} ảnh</strong> khỏi database +
            xóa file tương ứng trong R2 storage. <strong>KHÔNG thể hoàn tác.</strong>
          </p>
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            ⚠️ Các tham chiếu đang dùng ảnh này (gallery dịch vụ, ảnh blog, banner cuộn…) sẽ bị mất ảnh.
            Hãy xác nhận trước khi xóa.
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Gõ <code className="font-mono px-1 bg-muted rounded">XOA-TAT-CA</code> để xác nhận
            </label>
            <input
              type="text"
              autoFocus
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="XOA-TAT-CA"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-muted/40">
          <button onClick={onClose} disabled={pending} className="h-9 px-3 rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-muted disabled:opacity-50">
            Hủy
          </button>
          <button
            onClick={go}
            disabled={!matches || pending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Xóa vĩnh viễn {total} ảnh
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaEditDialog({
  media,
  onClose,
  onSaved,
  onDeleted,
}: {
  media: MediaRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const router = useRouter();
  const update = useServerFn(updateMediaMetaFn);
  const del = useServerFn(deleteMediaFn);
  const [form, setForm] = useState({
    alt_text: media.alt_text,
    title: media.title ?? "",
    tag: media.tag ?? "",
  });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setPending(true);
    try {
      await update({
        data: {
          id: media.id,
          alt_text: form.alt_text,
          title: form.title.trim() || null,
          tag: form.tag.trim() || null,
        },
      });
      toast.success("Đã lưu");
      await router.invalidate();
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirm(`Xóa ảnh "${media.title || media.r2_key}"? Ảnh sẽ chuyển sang trạng thái lưu trữ.`)) return;
    setPending(true);
    try {
      await del({ data: { id: media.id } });
      toast.success("Đã xóa");
      await router.invalidate();
      await onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
      setPending(false);
    }
  }

  async function copyUrl() {
    if (!media.url) return;
    await navigator.clipboard.writeText(media.url);
    toast.success("Đã copy URL");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="rounded-xl border border-border bg-background shadow-elevated max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="font-semibold flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Chỉnh sửa ảnh
          </div>
          <button onClick={onClose} className="grid place-items-center w-8 h-8 rounded-md hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid sm:grid-cols-[280px_1fr] gap-5 p-5">
          <div>
            <div className="aspect-square rounded-lg overflow-hidden bg-muted">
              {media.mime.startsWith("image/") && media.url ? (
                <img src={media.url} alt={media.alt_text} className="w-full h-full object-cover" />
              ) : (
                <div className="grid place-items-center h-full text-xs text-muted-foreground">{media.mime}</div>
              )}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Định dạng</span><span className="font-mono">{media.mime}</span></div>
              <div className="flex justify-between"><span>Kích thước</span><span>{formatBytes(media.bytes)}</span></div>
              {media.width && media.height && (
                <div className="flex justify-between"><span>Pixel</span><span>{media.width}×{media.height}</span></div>
              )}
              <div className="flex justify-between"><span>R2 key</span><span className="font-mono truncate ml-2">{media.r2_key}</span></div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Mô tả ảnh (alt text) — quan trọng cho SEO & người khiếm thị
              </label>
              <input
                type="text"
                value={form.alt_text}
                onChange={(e) => setForm((f) => ({ ...f, alt_text: e.target.value }))}
                maxLength={500}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Tiêu đề hiển thị (tùy chọn)
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                placeholder={media.r2_key.split("/").pop()}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Phân loại (tag) — gom nhóm trong thư viện
              </label>
              <input
                type="text"
                value={form.tag}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                maxLength={80}
                placeholder="vd: service-fulfill-gallery"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            </div>
            {media.url && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Đường dẫn công khai
                </label>
                <div className="flex gap-1.5">
                  <input
                    readOnly
                    value={media.url}
                    className="flex-1 h-9 px-3 rounded-md border border-input bg-surface-muted text-xs font-mono"
                  />
                  <button onClick={copyUrl} className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-surface-muted/40">
          <button onClick={remove} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-rose-300 bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 disabled:opacity-50">
            <Trash2 className="w-4 h-4" /> Xóa
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={pending} className="h-9 px-3 rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-muted disabled:opacity-50">
              Hủy
            </button>
            <button onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
