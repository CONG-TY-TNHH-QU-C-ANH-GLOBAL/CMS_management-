import { MediaPicker } from "@/features/media/components/MediaPicker";

import { buttonClass } from "./fields";

interface Props {
  label: string;
  hint?: React.ReactNode;
  mediaId: number | null;
  previewUrl: string | null;
  onChange: (mediaId: number | null, previewUrl: string | null) => void;
  pickerTitle: string;
  /** What the empty slot says — e.g. "Dùng ảnh bìa" when a fallback applies. */
  emptyLabel?: string;
}

/** One image from the media library: preview, pick/replace, remove. */
export function MediaField({
  label,
  hint,
  mediaId,
  previewUrl,
  onChange,
  pickerTitle,
  emptyLabel = "Chưa có ảnh",
}: Props) {
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="h-20 w-36 rounded-lg border border-border object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="grid h-20 w-36 place-items-center rounded-lg border border-dashed border-border px-2 text-center text-[11px] text-muted-foreground">
            {mediaId ? `Ảnh #${mediaId}` : emptyLabel}
          </div>
        )}
        <MediaPicker
          mode="single"
          value={mediaId ? [mediaId] : []}
          onChange={(ids, rows) =>
            onChange(ids[0] ?? null, rows[0]?.url ?? rows[0]?.thumb_url ?? null)
          }
          title={pickerTitle}
          trigger={
            <button type="button" className={buttonClass}>
              {mediaId ? "Đổi ảnh" : "Chọn ảnh"}
            </button>
          }
        />
        {mediaId && (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="text-sm text-muted-foreground hover:text-red-600"
          >
            Bỏ ảnh
          </button>
        )}
      </div>
      {hint && <span className="mt-2 block text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
