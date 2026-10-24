import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { inputClass } from "@/components/cms/article/fields";
import { createCampaignFn } from "@/features/campaigns/campaigns.actions";
import { slugify } from "@/features/community/community.slug";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (slug: string) => void;
}

const toSlug = (value: string) => (value.trim() ? slugify(value) : "");

/** Creates the VI source row as a draft; EN/ZH come from the translation
 *  pipeline, everything else is filled in the editor that opens next. */
export function NewCampaignDialog({ open, onOpenChange, onCreated }: Props) {
  const create = useServerFn(createCampaignFn);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, setPending] = useState(false);

  if (!open) return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || !slug) {
      toast.error("Cần tên và đường dẫn (slug).");
      return;
    }
    setPending(true);
    try {
      await create({ data: { slug, title: title.trim(), status: "draft" } });
      toast.success("Đã tạo Chương trình nháp");
      onOpenChange(false);
      setTitle("");
      setSlug("");
      setSlugTouched(false);
      onCreated(slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo Chương trình thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-surface p-5 shadow-elevated"
      >
        <div>
          <h2 className="text-lg font-semibold">Chương trình mới</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Tạo bản nháp tiếng Việt. Ngày chạy, menu, ảnh và hiển thị được chỉnh ở màn hình tiếp
            theo; bản EN/ZH được dịch tự động để duyệt.
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Tên Chương trình</span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(toSlug(e.target.value));
            }}
            required
            maxLength={200}
            placeholder="Christmas 2026 Collection"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Đường dẫn (slug)</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(toSlug(e.target.value));
            }}
            required
            maxLength={120}
            className={`${inputClass} font-mono`}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            thgfulfill.com/vi/campaigns/<span className="font-mono">{slug || "…"}</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Đang tạo…" : "Tạo Chương trình"}
          </button>
        </div>
      </form>
    </div>
  );
}
