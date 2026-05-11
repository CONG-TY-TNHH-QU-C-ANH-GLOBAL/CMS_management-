import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createIntegrationFn,
  updateIntegrationFn,
  type IntegrationRow,
} from "@/features/content/content.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  row?: IntegrationRow | null;
}

export function IntegrationDialog({ open, onOpenChange, onSaved, row }: Props) {
  const create = useServerFn(createIntegrationFn);
  const update = useServerFn(updateIntegrationFn);
  const [name, setName] = useState(row?.name ?? "");
  const [url, setUrl] = useState(row?.url ?? "");
  const [colorClass, setColorClass] = useState(row?.color_class ?? "");
  const [position, setPosition] = useState(row?.position ?? 99);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const payload = {
        position,
        name,
        url: url || null,
        color_class: colorClass || null,
      };
      if (row) {
        await update({ data: { id: row.id, ...payload } });
      } else {
        await create({ data: payload });
      }
      toast.success(row ? "Đã cập nhật integration" : "Đã thêm integration");
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
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {row ? "Sửa Integration" : "Thêm Integration"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Nền tảng đối tác (Shopify, Etsy, TikTok, Amazon...) — locale-agnostic.
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Tên</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              maxLength={100}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Shopify"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">URL (tùy chọn)</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={pending}
              maxLength={500}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://shopify.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Color class</label>
              <input
                type="text"
                value={colorClass}
                onChange={(e) => setColorClass(e.target.value)}
                disabled={pending}
                maxLength={100}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="text-green-600"
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
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Logo upload (R2) — sẽ thêm khi Media Library hoàn thiện. Hiện tại landing render icon từ name (font-aware).
          </p>
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
              {pending ? "Đang lưu..." : row ? "Cập nhật" : "Thêm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
