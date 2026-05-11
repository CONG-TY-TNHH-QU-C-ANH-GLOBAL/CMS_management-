import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createTestimonialFn,
  updateTestimonialFn,
  type Locale,
  type TestimonialRow,
} from "@/features/content/content.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  locale: Locale;
  row?: TestimonialRow | null;
}

export function TestimonialDialog({ open, onOpenChange, onSaved, locale, row }: Props) {
  const create = useServerFn(createTestimonialFn);
  const update = useServerFn(updateTestimonialFn);
  const [quote, setQuote] = useState(row?.quote ?? "");
  const [authorName, setAuthorName] = useState(row?.author_name ?? "");
  const [authorRole, setAuthorRole] = useState(row?.author_role ?? "");
  const [position, setPosition] = useState(row?.position ?? 99);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      if (row) {
        await update({
          data: { id: row.id, quote, author_name: authorName, author_role: authorRole || null, position },
        });
      } else {
        await create({
          data: { locale, position, quote, author_name: authorName, author_role: authorRole || null },
        });
      }
      toast.success(row ? "Đã cập nhật testimonial" : "Đã thêm testimonial");
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
            {row ? "Sửa Testimonial" : "Thêm Testimonial mới"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ngôn ngữ: <span className="font-mono uppercase">{locale}</span>
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Trích dẫn</label>
            <textarea
              required
              rows={4}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="THG đã giúp shop tôi giảm 30% chi phí ship..."
              disabled={pending}
              maxLength={2000}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Tên người</label>
              <input
                type="text"
                required
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Nguyễn Minh Khoa"
                disabled={pending}
                maxLength={200}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Vai trò (tùy chọn)</label>
              <input
                type="text"
                value={authorRole}
                onChange={(e) => setAuthorRole(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Founder, Shop ABC"
                disabled={pending}
                maxLength={200}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Vị trí</label>
            <input
              type="number"
              min={0}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="w-24 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={pending}
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
              {pending ? "Đang lưu..." : row ? "Cập nhật" : "Thêm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
