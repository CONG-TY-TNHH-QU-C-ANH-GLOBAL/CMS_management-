import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { inputClass } from "@/components/cms/article/fields";

export interface MenuItemDraft {
  icon: string;
  title: string;
  subtitle: string;
  href: string;
}

interface Props {
  items: MenuItemDraft[];
  onChange: (items: MenuItemDraft[]) => void;
  max?: number;
}

const EMPTY: MenuItemDraft = { icon: "", title: "", subtitle: "", href: "" };

const iconButton =
  "rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";

/** Repeatable list of mega-menu entries: icon, title, subtitle, link.
 *  Order on screen is the order on the website. */
export function MenuItemsEditor({ items, onChange, max = 24 }: Props) {
  function patch(index: number, key: keyof MenuItemDraft, value: string) {
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  /** Swap an entry with its neighbour; the buttons are disabled at the ends. */
  const move = (index: number, delta: -1 | 1) => {
    const next = items.slice();
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Mục trong menu thả xuống</span>
        <span className="text-[11px] text-muted-foreground">
          {items.length}/{max}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Hiện khi rê chuột vào mục ghim trên thanh điều hướng. Link là đường dẫn nội bộ không kèm
        ngôn ngữ (ví dụ /catalog/christmas) hoặc https://…
      </p>

      <div className="mt-3 space-y-2">
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Chưa có mục nào.
          </div>
        )}
        {items.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[4rem_1fr_1fr_1fr_auto]"
          >
            <input
              aria-label="Biểu tượng"
              value={item.icon}
              onChange={(e) => patch(index, "icon", e.target.value)}
              maxLength={16}
              placeholder="🎁"
              className={`${inputClass} mt-0 text-center`}
            />
            <input
              aria-label="Tiêu đề mục"
              value={item.title}
              onChange={(e) => patch(index, "title", e.target.value)}
              maxLength={120}
              placeholder="Tiêu đề"
              className={`${inputClass} mt-0`}
            />
            <input
              aria-label="Mô tả ngắn"
              value={item.subtitle}
              onChange={(e) => patch(index, "subtitle", e.target.value)}
              maxLength={200}
              placeholder="Mô tả ngắn"
              className={`${inputClass} mt-0`}
            />
            <input
              aria-label="Link"
              value={item.href}
              onChange={(e) => patch(index, "href", e.target.value)}
              maxLength={500}
              placeholder="/catalog/…"
              className={`${inputClass} mt-0 font-mono`}
            />
            <div className="flex items-center justify-end gap-0.5">
              <button
                type="button"
                title="Lên"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className={iconButton}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Xuống"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
                className={iconButton}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Xóa mục"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className={`${iconButton} hover:text-red-600`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={items.length >= max}
        onClick={() => onChange([...items, { ...EMPTY }])}
        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Thêm mục
      </button>
    </div>
  );
}
