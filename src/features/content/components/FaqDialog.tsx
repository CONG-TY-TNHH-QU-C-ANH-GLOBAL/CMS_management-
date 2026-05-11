import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createFaqFn,
  updateFaqFn,
  type FaqRow,
  type Locale,
} from "@/features/content/content.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  scope: string;
  locale: Locale;
  /** Pass row to edit; omit for create. */
  row?: FaqRow | null;
}

export function FaqDialog({ open, onOpenChange, onSaved, scope, locale, row }: Props) {
  const create = useServerFn(createFaqFn);
  const update = useServerFn(updateFaqFn);
  const [question, setQuestion] = useState(row?.question ?? "");
  const [answer, setAnswer] = useState(row?.answer ?? "");
  const [position, setPosition] = useState(row?.position ?? 99);
  const [pending, setPending] = useState(false);

  // Reset form when row changes (dialog reused for different entries)
  if (!pending && row && (question !== row.question || answer !== row.answer || position !== row.position) && !document.activeElement?.matches("textarea, input")) {
    // No-op; we're using uncontrolled init via useState — relies on caller remounting the dialog.
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      if (row) {
        await update({ data: { id: row.id, question, answer, position } });
      } else {
        await create({ data: { scope, position, locale, question, answer } });
      }
      toast.success(row ? "Đã cập nhật FAQ" : "Đã thêm FAQ");
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
            {row ? "Sửa FAQ" : "Thêm FAQ mới"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hiển thị tại: <span className="font-medium text-foreground">{scope === "home" ? "Trang chủ" : scope}</span>
            {" · "}
            Ngôn ngữ: <span className="font-medium text-foreground">{locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}</span>
          </p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Câu hỏi</label>
            <input
              type="text"
              required
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="VD: THG có hỗ trợ vận chuyển hàng dễ vỡ không?"
              disabled={pending}
              maxLength={500}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Câu trả lời</label>
            <textarea
              required
              rows={5}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="Trả lời ngắn gọn 2-4 câu..."
              disabled={pending}
              maxLength={5000}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Thứ tự hiển thị (số nhỏ đứng trước)
            </label>
            <input
              type="number"
              min={0}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="w-24 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={pending}
            />
          </div>
          {row ? (
            <p className="text-[11px] text-muted-foreground">
              Lưu ý: thay đổi này chỉ áp dụng cho bản dịch hiện tại. Các bản dịch khác giữ nguyên.
            </p>
          ) : null}
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
              {pending ? "Đang lưu..." : row ? "Cập nhật" : "Thêm FAQ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
