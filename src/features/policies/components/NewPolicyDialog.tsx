import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { upsertPolicyFn } from "@/features/policies/policies.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (slug: string) => void;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đ]/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function NewPolicyDialog({ open, onOpenChange, onCreated }: Props) {
  const upsert = useServerFn(upsertPolicyFn);
  const [slug, setSlug] = useState("");
  const [titleVi, setTitleVi] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleZh, setTitleZh] = useState("");
  const [pending, setPending] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  function onTitleViChange(value: string) {
    setTitleVi(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      if (!titleVi.trim()) { toast.error("Tiêu đề VI bắt buộc"); setPending(false); return; }
      const ops = [upsert({ data: { slug, locale: "vi", title: titleVi.trim() } })];
      if (titleEn.trim()) ops.push(upsert({ data: { slug, locale: "en", title: titleEn.trim() } }));
      if (titleZh.trim()) ops.push(upsert({ data: { slug, locale: "zh", title: titleZh.trim() } }));
      await Promise.all(ops);
      toast.success("Đã tạo chính sách");
      onOpenChange(false);
      onCreated(slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo thất bại");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm px-4" onClick={() => !pending && onOpenChange(false)}>
      <div className="w-full max-w-xl rounded-xl border border-border bg-background shadow-glow" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Chính sách mới</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Bước 1: Tạo khung chính sách. Bước 2: Bạn sẽ điền nội dung chi tiết ở trang chỉnh sửa tiếp theo.</p>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Đường dẫn URL</label>
            <input type="text" required value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} maxLength={200} pattern="[a-z0-9-]+" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" placeholder="warehouse-policy" disabled={pending} />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Tên chính sách (Tiếng Việt) <span className="text-red-600">*</span></label>
            <input type="text" required value={titleVi} onChange={(e) => onTitleViChange(e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Chính sách Warehouse" disabled={pending} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Tên chính sách (English)</label>
              <input type="text" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" disabled={pending} />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Tên chính sách (中文)</label>
              <input type="text" value={titleZh} onChange={(e) => setTitleZh(e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" disabled={pending} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} disabled={pending} className="h-9 px-3 rounded-md border border-border bg-background text-sm hover:bg-surface-muted">Hủy</button>
            <button type="submit" disabled={pending} className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50">{pending ? "Đang tạo..." : "Tạo và đi đến trang chỉnh sửa"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
