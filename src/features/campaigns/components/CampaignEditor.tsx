import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, areaClass, inputClass } from "@/components/cms/article/fields";
import { MarkdownEditor } from "@/components/cms/article/MarkdownEditor";
import { MediaField } from "@/components/cms/article/MediaField";
import { StickySaveBar } from "@/components/cms/StickySaveBar";
import { Card, CardHeader } from "@/components/cms/ui";
import { Switch } from "@/components/ui/switch";
import {
  deleteCampaignFn,
  updateCampaignFn,
  type CampaignRow,
  type CampaignStatus,
} from "@/features/campaigns/campaigns.actions";
import { effectiveFlag, parseMenuItems, vnToday } from "@/features/campaigns/campaigns.pure";

import { MenuItemsEditor, type MenuItemDraft } from "./MenuItemsEditor";

interface Props {
  campaign: CampaignRow;
  coverUrl: string | null;
  ogImageUrl: string | null;
  onSaved: () => void;
  onDeleted: () => void;
}

interface Draft {
  title: string;
  summary: string;
  body_md: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  position: number;
  landing_path: string;
  cta_label: string;
  nav_featured: boolean;
  nav_label: string;
  nav_badge: string;
  home_featured: boolean;
  menu_items: MenuItemDraft[];
  seo_title: string;
  seo_description: string;
  cover_media_id: number | null;
  og_image_id: number | null;
}

function toDraft(c: CampaignRow): Draft {
  return {
    title: c.title,
    summary: c.summary ?? "",
    body_md: c.body_md ?? "",
    start_date: c.start_date ?? "",
    end_date: c.end_date ?? "",
    status: c.status,
    position: c.position,
    landing_path: c.landing_path ?? "",
    cta_label: c.cta_label ?? "",
    nav_featured: c.nav_featured === 1,
    nav_label: c.nav_label ?? "",
    nav_badge: c.nav_badge ?? "",
    home_featured: c.home_featured === 1,
    menu_items: parseMenuItems(c.menu_items_json).map((item) => ({
      ...item,
      subtitle: item.subtitle ?? "",
    })),
    seo_title: c.seo_title ?? "",
    seo_description: c.seo_description ?? "",
    cover_media_id: c.cover_media_id,
    og_image_id: c.og_image_id,
  };
}

const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** Why an operator toggle is on but the website does not show it. */
function flagNote(on: boolean, draft: Draft): string | null {
  if (!on) return null;
  if (effectiveFlag(1, draft.status, orNull(draft.end_date), vnToday())) return null;
  return draft.status === "live"
    ? "Đã qua ngày kết thúc — website không còn hiển thị."
    : "Chương trình chưa xuất bản — website chưa hiển thị.";
}

function ToggleRow(props: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  note: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{props.label}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{props.hint}</div>
        {props.note && <div className="mt-1 text-[11px] text-amber-600">{props.note}</div>}
      </div>
      <Switch checked={props.checked} onCheckedChange={props.onChange} aria-label={props.label} />
    </div>
  );
}

export function CampaignEditor({ campaign, coverUrl, ogImageUrl, onSaved, onDeleted }: Props) {
  const update = useServerFn(updateCampaignFn);
  const remove = useServerFn(deleteCampaignFn);

  const initial = useMemo(() => toDraft(campaign), [campaign]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [coverPreview, setCoverPreview] = useState(coverUrl);
  const [ogPreview, setOgPreview] = useState(ogImageUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setCoverPreview(coverUrl);
    setOgPreview(ogImageUrl);
  }, [initial, coverUrl, ogImageUrl]);

  const dirtyCount = (Object.keys(initial) as (keyof Draft)[]).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]),
  ).length;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!draft.title.trim()) {
      toast.error("Tiêu đề bắt buộc.");
      return;
    }
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      toast.error("Ngày kết thúc phải sau ngày bắt đầu.");
      return;
    }
    setSaving(true);
    try {
      await update({
        data: {
          id: campaign.id,
          title: draft.title.trim(),
          summary: orNull(draft.summary),
          body_md: orNull(draft.body_md),
          cover_media_id: draft.cover_media_id,
          og_image_id: draft.og_image_id,
          start_date: orNull(draft.start_date),
          end_date: orNull(draft.end_date),
          status: draft.status,
          position: draft.position,
          landing_path: orNull(draft.landing_path),
          cta_label: orNull(draft.cta_label),
          nav_featured: draft.nav_featured,
          nav_label: orNull(draft.nav_label),
          nav_badge: orNull(draft.nav_badge),
          home_featured: draft.home_featured,
          menu_items: draft.menu_items.map((item) => ({
            icon: item.icon.trim(),
            title: item.title.trim(),
            subtitle: orNull(item.subtitle),
            href: item.href.trim(),
          })),
          seo_title: orNull(draft.seo_title),
          seo_description: orNull(draft.seo_description),
        },
      });
      toast.success("Đã lưu Chương trình");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Xóa Chương trình này cùng các bản dịch? Không thể hoàn tác.")) return;
    try {
      await remove({ data: { id: campaign.id } });
      toast.success("Đã xóa Chương trình");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  const publicPath = draft.landing_path.trim() || `/campaigns/${campaign.slug}`;
  const publicUrl = publicPath.startsWith("https://")
    ? publicPath
    : `https://thgfulfill.com/vi${publicPath}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Nội dung"
          hint={`Trang chi tiết: thgfulfill.com/vi/campaigns/${campaign.slug}`}
          action={
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Xem trên trang thật
            </a>
          }
        />
        <div className="space-y-4 p-5">
          <Field label="Tiêu đề" required count={{ length: draft.title.length, max: 200 }}>
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={200}
              className={inputClass}
            />
          </Field>
          <Field
            label="Tóm tắt"
            count={{ length: draft.summary.length, max: 500 }}
            hint="Hiện trên thẻ Chương trình ở trang chủ và trang danh sách."
          >
            <textarea
              value={draft.summary}
              onChange={(e) => set("summary", e.target.value)}
              maxLength={500}
              rows={3}
              className={areaClass}
            />
          </Field>
          <MarkdownEditor
            label="Nội dung chi tiết"
            value={draft.body_md}
            onChange={(value) => set("body_md", value)}
            maxLength={60_000}
            placeholder={"## Ưu đãi mùa lễ\n\n- Sản phẩm nổi bật\n- Điều kiện áp dụng"}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Thời gian & liên kết" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Ngày bắt đầu">
            <input
              type="date"
              value={draft.start_date}
              onChange={(e) => set("start_date", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Ngày kết thúc"
            hint="Sau ngày này (giờ Việt Nam) Chương trình tự rời thanh điều hướng và trang chủ."
          >
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) => set("end_date", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Trang đích"
            hint="Đường dẫn nội bộ không kèm ngôn ngữ (/christmas) hoặc https://… Bỏ trống thì dùng trang chi tiết."
          >
            <input
              value={draft.landing_path}
              onChange={(e) => set("landing_path", e.target.value)}
              maxLength={500}
              placeholder={`/campaigns/${campaign.slug}`}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label="Chữ trên nút CTA" count={{ length: draft.cta_label.length, max: 80 }}>
            <input
              value={draft.cta_label}
              onChange={(e) => set("cta_label", e.target.value)}
              maxLength={80}
              placeholder="Khám phá bộ sưu tập"
              className={inputClass}
            />
          </Field>
          <Field label="Thứ tự" hint="Số nhỏ hiện trước.">
            <input
              type="number"
              min={0}
              value={draft.position}
              onChange={(e) => set("position", Math.max(0, Number(e.target.value) || 0))}
              className={inputClass}
            />
          </Field>
          <Field label="Trạng thái">
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value as CampaignStatus)}
              className={inputClass}
            >
              <option value="draft">Nháp — chưa hiển thị</option>
              <option value="live">Xuất bản — hiển thị trên website</option>
              <option value="archived">Lưu trữ — đã kết thúc, ẩn khỏi website</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Hiển thị" hint="Website chỉ hiện Chương trình đầu tiên được bật" />
        <div className="space-y-5 p-5">
          <ToggleRow
            label="Ghim lên thanh điều hướng"
            hint="Thêm một mục nổi bật trên menu, rê chuột vào sẽ mở menu thả xuống."
            checked={draft.nav_featured}
            onChange={(value) => set("nav_featured", value)}
            note={flagNote(draft.nav_featured, draft)}
          />
          {draft.nav_featured && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên trên menu" count={{ length: draft.nav_label.length, max: 40 }}>
                <input
                  value={draft.nav_label}
                  onChange={(e) => set("nav_label", e.target.value)}
                  maxLength={40}
                  placeholder="Christmas"
                  className={inputClass}
                />
              </Field>
              <Field label="Nhãn nhỏ (badge)" hint="Ví dụ NEW, HOT. Bỏ trống để ẩn.">
                <input
                  value={draft.nav_badge}
                  onChange={(e) => set("nav_badge", e.target.value)}
                  maxLength={16}
                  placeholder="NEW"
                  className={inputClass}
                />
              </Field>
            </div>
          )}
          {draft.nav_featured && (
            <MenuItemsEditor
              items={draft.menu_items}
              onChange={(items) => set("menu_items", items)}
            />
          )}
          <ToggleRow
            label="Hiện ở trang chủ"
            hint="Đặt Chương trình này vào khối nổi bật trên trang chủ."
            checked={draft.home_featured}
            onChange={(value) => set("home_featured", value)}
            note={flagNote(draft.home_featured, draft)}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Hình ảnh & SEO" />
        <div className="space-y-5 p-5">
          <MediaField
            label="Ảnh bìa"
            mediaId={draft.cover_media_id}
            previewUrl={coverPreview}
            onChange={(id, preview) => {
              set("cover_media_id", id);
              setCoverPreview(preview);
            }}
            pickerTitle="Chọn ảnh bìa Chương trình"
          />
          <Field
            label="SEO title"
            count={{ length: draft.seo_title.length, max: 200, ideal: 60 }}
            hint="Bỏ trống thì dùng tiêu đề."
          >
            <input
              value={draft.seo_title}
              onChange={(e) => set("seo_title", e.target.value)}
              maxLength={200}
              className={inputClass}
            />
          </Field>
          <Field
            label="SEO description"
            count={{ length: draft.seo_description.length, max: 300, ideal: 160 }}
            hint="Bỏ trống thì dùng tóm tắt."
          >
            <textarea
              value={draft.seo_description}
              onChange={(e) => set("seo_description", e.target.value)}
              maxLength={300}
              rows={2}
              className={areaClass}
            />
          </Field>
          <MediaField
            label="Ảnh chia sẻ mạng xã hội (OG image)"
            mediaId={draft.og_image_id}
            previewUrl={ogPreview}
            onChange={(id, preview) => {
              set("og_image_id", id);
              setOgPreview(preview);
            }}
            pickerTitle="Chọn ảnh chia sẻ mạng xã hội"
            emptyLabel="Dùng ảnh bìa"
            hint="Kích thước tốt nhất 1200×630. Bỏ trống thì dùng ảnh bìa."
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:border-red-300 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> Xóa Chương trình
        </button>
      </div>

      <StickySaveBar
        count={dirtyCount}
        saving={saving}
        onSave={onSave}
        onDiscard={() => {
          setDraft(initial);
          setCoverPreview(coverUrl);
          setOgPreview(ogImageUrl);
        }}
        hint={
          draft.status === "live"
            ? "Chương trình đang xuất bản — bấm Lưu là website cập nhật."
            : "Chương trình chưa xuất bản — lưu xong vẫn chưa hiện trên website."
        }
      />
    </div>
  );
}
