import {
  Bold,
  Columns2,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Quote,
  Youtube,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { MediaPicker } from "@/features/media/components/MediaPicker";
import type { MediaRow } from "@/features/media/media.actions";

import { MarkdownPreview } from "./MarkdownPreview";
import {
  imageMarkdown,
  insertBlock,
  insertLink,
  setHeading,
  toggleLinePrefix,
  wrapInline,
  type Selection,
  type TextEdit,
} from "./markdown-edit";
import { parseYouTubeId, youtubeShortUrl } from "./youtube";

type Mode = "write" | "preview" | "split";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  placeholder?: string;
}

/** An image the landing can load from another origin: the stored absolute
 *  URL, or the r2_key itself for legacy external-URL rows. */
function publicImageUrl(row: MediaRow | undefined): string | null {
  if (!row) return null;
  if (row.url && /^https?:\/\//i.test(row.url)) return row.url;
  if (/^https?:\/\//i.test(row.r2_key)) return row.r2_key;
  return null;
}

const LINK = /^(https?:\/\/|mailto:|tel:|\/)/i;

/**
 * The article body editor shared by Event and Blog: Markdown with a toolbar,
 * images from the media library, YouTube videos, and a preview rendered by the
 * same library the website uses.
 */
export function MarkdownEditor({
  label,
  value,
  onChange,
  maxLength,
  rows = 18,
  placeholder,
}: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>("write");

  function current(): Selection {
    const el = area.current;
    return {
      value,
      start: el?.selectionStart ?? value.length,
      end: el?.selectionEnd ?? value.length,
    };
  }

  function apply(edit: TextEdit) {
    onChange(edit.value);
    // Restore focus + selection after React commits the new value.
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  function onLink() {
    const url = window.prompt(
      "Dán đường dẫn (https://…, mailto:…, hoặc /vi/… cho trang trong website):",
    );
    if (url === null) return;
    const trimmed = url.trim();
    if (!LINK.test(trimmed)) {
      toast.error("Đường dẫn phải bắt đầu bằng https://, mailto:, tel: hoặc /");
      return;
    }
    apply(insertLink(current(), trimmed, "chữ hiển thị"));
  }

  function onVideo() {
    const url = window.prompt("Dán link video YouTube:");
    if (url === null) return;
    const id = parseYouTubeId(url);
    if (!id) {
      toast.error(
        "Không nhận ra link YouTube. Dán link dạng youtu.be/… hoặc youtube.com/watch?v=…",
      );
      return;
    }
    apply(insertBlock(current(), youtubeShortUrl(id)));
  }

  function onImage(rows: MediaRow[]) {
    const url = publicImageUrl(rows[0]);
    if (!url) {
      toast.error("Không lấy được link công khai của ảnh này — hãy tải ảnh lên lại.");
      return;
    }
    apply(insertBlock(current(), imageMarkdown(url, rows[0].alt_text || rows[0].title || "")));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") apply(wrapInline(current(), "**", "**", "chữ đậm"));
    else if (key === "i") apply(wrapInline(current(), "*", "*", "chữ nghiêng"));
    else if (key === "k") onLink();
    else return;
    e.preventDefault();
  }

  const tools: { icon: typeof Bold; title: string; run: () => void }[] = [
    { icon: Heading2, title: "Tiêu đề mục (##)", run: () => apply(setHeading(current(), 2)) },
    { icon: Heading3, title: "Tiêu đề phụ (###)", run: () => apply(setHeading(current(), 3)) },
    {
      icon: Bold,
      title: "In đậm (Ctrl+B)",
      run: () => apply(wrapInline(current(), "**", "**", "chữ đậm")),
    },
    {
      icon: Italic,
      title: "In nghiêng (Ctrl+I)",
      run: () => apply(wrapInline(current(), "*", "*", "chữ nghiêng")),
    },
    {
      icon: List,
      title: "Danh sách chấm",
      run: () => apply(toggleLinePrefix(current(), "bullet")),
    },
    {
      icon: ListOrdered,
      title: "Danh sách số",
      run: () => apply(toggleLinePrefix(current(), "numbered")),
    },
    {
      icon: Quote,
      title: "Trích dẫn / lưu ý",
      run: () => apply(toggleLinePrefix(current(), "quote")),
    },
    { icon: Link2, title: "Chèn liên kết (Ctrl+K)", run: onLink },
    { icon: Minus, title: "Đường kẻ ngang", run: () => apply(insertBlock(current(), "---")) },
  ];

  const over = value.length > maxLength;
  const toolClass =
    "grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

  const editor = (
    <textarea
      ref={area}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      rows={rows}
      spellCheck={false}
      placeholder={placeholder}
      className="block w-full resize-y rounded-b-lg border-0 bg-background px-3 py-2.5 font-mono text-sm leading-relaxed focus:outline-none"
    />
  );
  const preview = (
    <div className="max-h-[70vh] min-h-48 overflow-y-auto bg-background px-4 py-3">
      <MarkdownPreview markdown={value} />
    </div>
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={`text-[11px] tabular-nums ${over ? "text-red-600" : "text-muted-foreground"}`}
        >
          {value.length.toLocaleString("vi-VN")}/{maxLength.toLocaleString("vi-VN")} ký tự
        </span>
      </div>

      <div className="mt-1 overflow-hidden rounded-lg border border-border focus-within:ring-2 focus-within:ring-ring">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-1.5 py-1">
          <div className="flex flex-wrap items-center gap-0.5">
            {mode !== "preview" && (
              <>
                {tools.map(({ icon: Icon, title, run }) => (
                  <button
                    key={title}
                    type="button"
                    title={title}
                    onClick={run}
                    className={toolClass}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-border" />
                <MediaPicker
                  mode="single"
                  value={[]}
                  onChange={(_, picked) => onImage(picked)}
                  title="Chèn ảnh vào bài"
                  trigger={
                    <button type="button" title="Chèn ảnh từ thư viện" className={toolClass}>
                      <ImagePlus className="h-4 w-4" />
                    </button>
                  }
                />
                <button
                  type="button"
                  title="Chèn video YouTube"
                  onClick={onVideo}
                  className={toolClass}
                >
                  <Youtube className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-0.5 rounded-md bg-background p-0.5">
            {(
              [
                ["write", PenLine, "Soạn thảo"],
                ["split", Columns2, "Song song"],
                ["preview", Eye, "Xem trước"],
              ] as const
            ).map(([key, Icon, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium ${
                  mode === key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                } ${key === "split" ? "hidden xl:inline-flex" : ""}`}
              >
                <Icon className="h-3.5 w-3.5" /> {text}
              </button>
            ))}
          </div>
        </div>

        {mode === "write" && editor}
        {mode === "preview" && preview}
        {mode === "split" && (
          <div className="grid grid-cols-2 divide-x divide-border">
            {editor}
            {preview}
          </div>
        )}
      </div>

      <span className="mt-1 block text-[11px] text-muted-foreground">
        Bôi đen chữ rồi bấm nút trên thanh công cụ. Video YouTube và ảnh phải nằm trên một dòng
        riêng — website sẽ hiện trình phát video ngay trong bài.
      </span>
    </div>
  );
}
