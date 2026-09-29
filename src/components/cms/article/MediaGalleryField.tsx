import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { MediaPicker } from "@/features/media/components/MediaPicker";

import { buttonClass } from "./fields";

export interface GalleryItem {
  media_id: number;
  /** Event photos call it a caption, blog slides call it alt text — same slot. */
  caption: string;
  preview: string | null;
}

interface Props {
  label: string;
  hint?: React.ReactNode;
  items: GalleryItem[];
  onChange: (items: GalleryItem[]) => void;
  max: number;
  pickerTitle: string;
  captionPlaceholder: string;
  /** Badge on the first image when the site treats it differently (blog: large featured image). */
  firstBadge?: string;
}

/**
 * Ordered images from the media library. The picker decides membership;
 * order is set here with the arrows, and survives re-opening the picker —
 * images already in the gallery keep their place, new picks are appended.
 */
export function MediaGalleryField({
  label,
  hint,
  items,
  onChange,
  max,
  pickerTitle,
  captionPlaceholder,
  firstBadge,
}: Props) {
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {items.length} ảnh — tối đa {max}
        </span>
      </div>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {items.map((item, index) => (
          <div key={`${item.media_id}-${index}`} className="w-36 space-y-1">
            <div className="relative">
              {item.preview ? (
                <img
                  src={item.preview}
                  alt=""
                  className="h-20 w-36 rounded-lg border border-border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="grid h-20 w-36 place-items-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                  Ảnh #{item.media_id}
                </div>
              )}
              {firstBadge && index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                  {firstBadge}
                </span>
              )}
              <div className="absolute right-1 top-1 flex gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  title="Đưa lên trước"
                  className="grid h-6 w-6 place-items-center rounded bg-black/55 text-white disabled:opacity-30"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  title="Đưa ra sau"
                  className="grid h-6 w-6 place-items-center rounded bg-black/55 text-white disabled:opacity-30"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  title="Bỏ ảnh này"
                  className="grid h-6 w-6 place-items-center rounded bg-black/55 text-white hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            <input
              value={item.caption}
              onChange={(e) => {
                const caption = e.target.value;
                onChange(items.map((it, i) => (i === index ? { ...it, caption } : it)));
              }}
              maxLength={300}
              placeholder={captionPlaceholder}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-[11px]"
            />
          </div>
        ))}
        <MediaPicker
          mode="multi"
          value={items.map((item) => item.media_id)}
          onChange={(ids, rows) => {
            const known = new Map(items.map((item) => [item.media_id, item]));
            const previews = new Map(rows.map((row) => [row.id, row.url ?? row.thumb_url ?? null]));
            const picked = new Set(ids);
            const kept = items.filter((item) => picked.has(item.media_id));
            const added = ids
              .filter((id) => !known.has(id))
              .map((id) => ({ media_id: id, caption: "", preview: previews.get(id) ?? null }));
            onChange([...kept, ...added].slice(0, max));
          }}
          title={pickerTitle}
          trigger={
            <button type="button" className={`${buttonClass} h-20`}>
              Thêm / bớt ảnh
            </button>
          }
        />
      </div>
    </div>
  );
}
