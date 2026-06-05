import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createMarqueeImageFromUrlFn,
  updateMarqueeImageFn,
  type MarqueeImageRow,
} from "@/features/content/content.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  row?: MarqueeImageRow | null;
}

export function MarqueeImageDialog({ open, onOpenChange, onSaved, row }: Props) {
  const create = useServerFn(createMarqueeImageFromUrlFn);
  const update = useServerFn(updateMarqueeImageFn);
  const [url, setUrl] = useState(row?.src ?? "");
  const [altText, setAltText] = useState(row?.alt_text ?? "");
  const [position, setPosition] = useState(row?.position ?? 99);
  const [pending, setPending] = useState(false);

  const isEdit = !!row;

  // Re-sync on open / row change — the dialog instance is kept mounted across
  // open/close, so without this a reopened dialog shows abandoned edits.
  useEffect(() => {
    if (!open) return;
    setUrl(row?.src ?? "");
    setAltText(row?.alt_text ?? "");
    setPosition(row?.position ?? 99);
    setPending(false);
  }, [open, row]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      if (row) {
        // Edit only updates alt + position; image swap requires Media Library (Phase 2).
        await update({ data: { id: row.id, alt_text: altText, position } });
      } else {
        await create({ data: { url, alt_text: altText, position } });
      }
      toast.success(isEdit ? "Đã cập nhật ảnh" : "Đã thêm ảnh");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm px-4"
      onClick={() => !pending && onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-background shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? "Sửa Marquee Image" : "Thêm Marquee Image"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isEdit
              ? "Sửa alt text + vị trí. Đổi ảnh — chờ Media Library (R2 upload UI)."
              : "Dán URL ảnh (ladicdn / Cloudinary / R2 public URL). R2 upload UI đến trong Phase 2."}
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">URL ảnh</label>
              <input
                type="url"
                required
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={pending}
                maxLength={2000}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://w.ladicdn.com/..."
              />
            </div>
          )}
          {isEdit && (
            <div className="rounded-lg border border-border bg-surface-muted overflow-hidden">
              <img
                src={row?.src}
                alt={row?.alt_text}
                className="w-full max-h-40 object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Alt text (bắt buộc — SEO + screen reader)
            </label>
            <input
              type="text"
              required
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              disabled={pending}
              maxLength={200}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Kho US đóng gói đơn hàng POD T-shirt"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Vị trí</label>
            <input
              type="number"
              min={0}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              disabled={pending}
              className="w-24 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="h-9 px-3 rounded-md border border-border bg-background text-sm hover:bg-surface-muted"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Thêm ảnh"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
