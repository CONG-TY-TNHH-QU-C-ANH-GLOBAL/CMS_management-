import { CircleAlert, CircleCheck, ExternalLink } from "lucide-react";

import { Field, inputClass } from "./fields";
import { parseYouTubeId, youtubeThumb } from "./youtube";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What the website does with a valid link, shown once it parses. */
  playsWhere: string;
}

/**
 * A YouTube link input that says, before saving, whether the website will be
 * able to play it — a Facebook link or a channel URL pasted here used to save
 * fine and then render nothing.
 */
export function YouTubeUrlField({ label, value, onChange, playsWhere }: Props) {
  const trimmed = value.trim();
  const id = parseYouTubeId(trimmed);

  return (
    <div>
      <Field label={label}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          placeholder="https://youtu.be/… hoặc https://www.youtube.com/watch?v=…"
          className={inputClass}
        />
      </Field>
      {trimmed && !id && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-600">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          Đây không phải link video YouTube — website sẽ không phát được. Dán link dạng youtu.be/…
          hoặc youtube.com/watch?v=…
        </p>
      )}
      {id && (
        <div className="mt-2 flex items-center gap-3">
          <img
            src={youtubeThumb(id)}
            alt=""
            className="h-16 w-28 rounded-md border border-border object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="space-y-1 text-[11px]">
            <p className="flex items-center gap-1.5 text-emerald-700">
              <CircleCheck className="h-3.5 w-3.5 shrink-0" />
              {playsWhere}
            </p>
            <a
              href={`https://youtu.be/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Mở trên YouTube
            </a>
          </div>
        </div>
      )}
      {!trimmed && (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          Video để chế độ Công khai hoặc Không công khai (Unlisted) đều nhúng được; video Riêng tư
          thì không.
        </span>
      )}
    </div>
  );
}
