import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, inputClass } from "@/components/cms/article/fields";
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

import {
  CONTENT_FIELDS,
  LINK_FIELDS,
  NAV_FIELDS,
  SEO_FIELDS,
  draftFromRow,
  draftProblem,
  draftToPayload,
  flagNote,
  type CampaignDraft,
} from "./campaign-draft";
import { LandingCard } from "./LandingCard";
import { MenuItemsEditor } from "./MenuItemsEditor";
import { TextFields } from "./TextFields";

interface Props {
  campaign: CampaignRow;
  coverUrl: string | null;
  ogImageUrl: string | null;
  onSaved: () => void;
  onDeleted: () => void;
}

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: "draft", label: "Nháp — chưa hiển thị" },
  { value: "live", label: "Xuất bản — hiển thị trên website" },
  { value: "archived", label: "Lưu trữ — đã kết thúc, ẩn khỏi website" },
];

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

  const initial = useMemo(() => draftFromRow(campaign), [campaign]);
  const [draft, setDraft] = useState<CampaignDraft>(initial);
  const [previews, setPreviews] = useState({ cover: coverUrl, og: ogImageUrl });
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDraft(initial);
    setPreviews({ cover: coverUrl, og: ogImageUrl });
  };
  useEffect(() => {
    setDraft(initial);
    setPreviews({ cover: coverUrl, og: ogImageUrl });
  }, [initial, coverUrl, ogImageUrl]);

  const dirtyCount = (Object.keys(initial) as (keyof CampaignDraft)[]).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]),
  ).length;

  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  async function run(action: () => Promise<unknown>, done: string, after: () => void) {
    try {
      await action();
      toast.success(done);
      after();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thao tác thất bại");
    }
  }

  async function onSave() {
    const problem = draftProblem(draft);
    if (problem) return void toast.error(problem);
    setSaving(true);
    await run(
      () => update({ data: draftToPayload(campaign.id, draft) }),
      "Đã lưu Chương trình",
      onSaved,
    );
    setSaving(false);
  }

  async function onDelete() {
    if (!confirm("Xóa Chương trình này cùng các bản dịch? Không thể hoàn tác.")) return;
    await run(() => remove({ data: { id: campaign.id } }), "Đã xóa Chương trình", onDeleted);
  }

  const detailPath = `/campaigns/${campaign.slug}`;
  const target = draft.landing_path.trim() || detailPath;
  const liveUrl = target.startsWith("https://") ? target : `https://thgfulfill.com/vi${target}`;
  const fieldProps = { draft, set };

  const image = (key: "cover" | "og") => ({
    mediaId: key === "cover" ? draft.cover_media_id : draft.og_image_id,
    previewUrl: previews[key],
    onChange: (id: number | null, preview: string | null) => {
      set(key === "cover" ? "cover_media_id" : "og_image_id", id);
      setPreviews((prev) => ({ ...prev, [key]: preview }));
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Nội dung"
          hint={`Trang chi tiết: thgfulfill.com/vi${detailPath}`}
          action={
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Mở trang đích
            </a>
          }
        />
        <div className="space-y-4 p-5">
          <TextFields specs={CONTENT_FIELDS} {...fieldProps} />
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
          {(["start_date", "end_date"] as const).map((key) => (
            <Field
              key={key}
              label={key === "start_date" ? "Ngày bắt đầu" : "Ngày kết thúc"}
              hint={
                key === "end_date"
                  ? "Sau ngày này (giờ Việt Nam) Chương trình tự rời thanh điều hướng và trang chủ."
                  : undefined
              }
            >
              <input
                type="date"
                value={draft[key]}
                onChange={(e) => set(key, e.target.value)}
                className={inputClass}
              />
            </Field>
          ))}
          <TextFields specs={LINK_FIELDS} {...fieldProps} />
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
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <LandingCard campaignId={campaign.id} onPublished={onSaved} />

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
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextFields specs={NAV_FIELDS} {...fieldProps} />
              </div>
              <MenuItemsEditor
                items={draft.menu_items}
                onChange={(items) => set("menu_items", items)}
              />
            </>
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
          <MediaField label="Ảnh bìa" pickerTitle="Chọn ảnh bìa Chương trình" {...image("cover")} />
          <TextFields specs={SEO_FIELDS} {...fieldProps} />
          <MediaField
            label="Ảnh chia sẻ mạng xã hội (OG image)"
            pickerTitle="Chọn ảnh chia sẻ"
            emptyLabel="Dùng ảnh bìa"
            hint="Kích thước tốt nhất 1200×630. Bỏ trống thì dùng ảnh bìa."
            {...image("og")}
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
        onDiscard={reset}
        hint={
          draft.status === "live"
            ? "Chương trình đang xuất bản — bấm Lưu là website cập nhật."
            : "Chương trình chưa xuất bản — lưu xong vẫn chưa hiện trên website."
        }
      />
    </div>
  );
}
