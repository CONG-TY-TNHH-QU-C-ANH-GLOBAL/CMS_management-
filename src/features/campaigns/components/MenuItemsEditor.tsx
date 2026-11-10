import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { inputClass } from "@/components/cms/article/fields";
import { MediaField } from "@/components/cms/article/MediaField";

export interface MenuItemDraft {
  icon: string;
  title: string;
  subtitle: string;
  href: string;
  /** Hover card on the right of the menu. All empty = the campaign's default card. */
  card_image_id: number | null;
  /** UI-only preview of card_image_id; never sent to the server. */
  card_image_url: string | null;
  card_title: string;
  card_text: string;
  card_cta: string;
}

type TextKey = "icon" | "title" | "subtitle" | "href" | "card_title" | "card_text" | "card_cta";

interface Props {
  items: MenuItemDraft[];
  onChange: (items: MenuItemDraft[]) => void;
  max?: number;
}

const EMPTY: MenuItemDraft = {
  icon: "",
  title: "",
  subtitle: "",
  href: "",
  card_image_id: null,
  card_image_url: null,
  card_title: "",
  card_text: "",
  card_cta: "",
};

const iconButton =
  "rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";

const hasCard = (item: MenuItemDraft) =>
  item.card_image_id !== null || !!(item.card_title || item.card_text || item.card_cta);

/** Repeatable list of mega-menu entries: icon, title, subtitle, link, and an
 *  optional hover card (image + copy) that replaces the right-hand promo panel
 *  while the entry is hovered. Order on screen is the order on the website. */
export function MenuItemsEditor({ items, onChange, max = 24 }: Props) {
  const replace = (index: number, change: Partial<MenuItemDraft>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...change } : item)));

  const patch = (index: number, key: TextKey, value: string) => replace(index, { [key]: value });

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
        ngôn ngữ (ví dụ /catalog/christmas) hoặc https://… Mở &quot;Thẻ xem trước&quot; để mục đó có
        ảnh và nội dung riêng ở khung bên phải.
      </p>

      <div className="mt-3 space-y-2">
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Chưa có mục nào.
          </div>
        )}
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[4rem_1fr_1fr_1fr_auto]">
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

            <details className="mt-2">
              <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
                Thẻ xem trước khi rê chuột{" "}
                {hasCard(item) ? "· đã thiết lập" : "· dùng thẻ mặc định"}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
                <MediaField
                  label="Ảnh thẻ"
                  pickerTitle="Chọn ảnh cho thẻ xem trước"
                  emptyLabel="Dùng ảnh bìa"
                  hint="Bỏ trống thì dùng ảnh bìa Chương trình. Tỉ lệ ngang, rộng tối thiểu 600px."
                  mediaId={item.card_image_id}
                  previewUrl={item.card_image_url}
                  onChange={(id, url) => replace(index, { card_image_id: id, card_image_url: url })}
                />
                <div className="space-y-2">
                  <input
                    aria-label="Tiêu đề thẻ"
                    value={item.card_title}
                    onChange={(e) => patch(index, "card_title", e.target.value)}
                    maxLength={120}
                    placeholder="Tiêu đề thẻ (bỏ trống = tiêu đề Chương trình)"
                    className={`${inputClass} mt-0`}
                  />
                  <textarea
                    aria-label="Nội dung thẻ"
                    value={item.card_text}
                    onChange={(e) => patch(index, "card_text", e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder="Nội dung thẻ (bỏ trống = tóm tắt Chương trình)"
                    className={`${inputClass} mt-0`}
                  />
                  <input
                    aria-label="Chữ trên nút thẻ"
                    value={item.card_cta}
                    onChange={(e) => patch(index, "card_cta", e.target.value)}
                    maxLength={80}
                    placeholder="Chữ trên nút (bỏ trống = nút CTA của Chương trình)"
                    className={`${inputClass} mt-0`}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Khi có thẻ riêng, nút trong thẻ dẫn tới link của mục này.
                  </p>
                </div>
              </div>
            </details>
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
