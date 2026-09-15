import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { createEventFn } from "@/features/events/events.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (slug: string) => void;
}

/** Same Vietnamese-safe slugifier the blog and careers dialogs carry. Kept local
 *  for the same reason they do: it runs in the browser as the operator types, so
 *  it must not pull in anything that reaches the database layer. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Creates the VI row only, as a draft.
 *
 *  VI is the canonical source language across this CMS (blog, careers, shipping
 *  all write VI first and translate downstream), and an Event usually has its EN
 *  and ZH copy written later or not at all. Creating three empty rows up front
 *  would put two untranslated Events on the landing the moment someone flips
 *  status, so the other locales are added deliberately from the editor instead. */
export function NewEventDialog({ open, onOpenChange, onCreated }: Props) {
  const create = useServerFn(createEventFn);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [eventDate, setEventDate] = useState(today());
  const [pending, setPending] = useState(false);

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Tiêu đề Event bắt buộc.");
      return;
    }
    if (!slug) {
      toast.error("Đường dẫn (slug) bắt buộc.");
      return;
    }
    setPending(true);
    try {
      await create({
        data: {
          slug,
          locale: "vi",
          title: title.trim(),
          event_date: eventDate,
          status: "draft",
        },
      });
      toast.success("Đã tạo Event nháp");
      onOpenChange(false);
      setTitle("");
      setSlug("");
      setSlugTouched(false);
      onCreated(slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo Event thất bại");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-surface p-5 shadow-elevated"
      >
        <div>
          <h2 className="text-lg font-semibold">Event mới</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Tạo bản nháp tiếng Việt. Nội dung chi tiết, ảnh bìa và bản dịch EN/ZH được thêm ở màn
            hình chỉnh sửa ngay sau đây.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Tên Event</span>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            required
            maxLength={200}
            placeholder="THG x ONPOINT"
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Đường dẫn (slug)</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            required
            maxLength={120}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            thgfulfill.com/vi/events/<span className="font-mono">{slug || "…"}</span>
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Ngày diễn ra</span>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
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
            {pending ? "Đang tạo…" : "Tạo Event"}
          </button>
        </div>
      </form>
    </div>
  );
}
