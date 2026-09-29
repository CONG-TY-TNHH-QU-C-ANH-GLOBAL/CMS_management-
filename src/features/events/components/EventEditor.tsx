import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import { StickySaveBar } from "@/components/cms/StickySaveBar";
import { Field, areaClass, inputClass } from "@/components/cms/article/fields";
import { MarkdownEditor } from "@/components/cms/article/MarkdownEditor";
import { MediaField } from "@/components/cms/article/MediaField";
import { MediaGalleryField, type GalleryItem } from "@/components/cms/article/MediaGalleryField";
import { YouTubeUrlField } from "@/components/cms/article/YouTubeUrlField";
import { parseYouTubeId } from "@/components/cms/article/youtube";
import {
  createEventFn,
  deleteEventFn,
  replaceEventPhotosFn,
  updateEventFn,
  type EventLocale,
  type EventPhotoRow,
  type EventRow,
} from "@/features/events/events.actions";
import { toMediaUrl } from "@/features/partners/partners.media";

interface Props {
  slug: string;
  locale: EventLocale;
  event: EventRow | null;
  photos: EventPhotoRow[];
  /** Cover preview URL resolved by the loader — `cover_media_id` alone cannot be
   *  turned into a URL on the client. Null when no cover is set. */
  coverUrl: string | null;
  /** Social share image preview, resolved by the loader like the cover. */
  ogImageUrl: string | null;
  onSaved: () => void;
}

const LOCALE_LABEL: Record<EventLocale, string> = {
  vi: "Tiếng Việt",
  en: "English",
  zh: "中文",
};

/** The four ways THG has actually taken part, offered as suggestions rather than
 *  a closed <select>: `role` is free text in the schema (migration 0043) and
 *  marketing keeps inventing new ones ("Đồng tổ chức webinar"). */
const ROLE_SUGGESTIONS = [
  "Nhà tài trợ",
  "Gian hàng",
  "Diễn giả",
  "Tham dự",
  "Đồng tổ chức webinar",
  "Sự kiện đối tác",
];

interface Draft {
  title: string;
  summary: string;
  body_md: string;
  event_date: string;
  end_date: string;
  location: string;
  role: string;
  url: string;
  video_url: string;
  seo_title: string;
  seo_description: string;
  status: "draft" | "live";
  cover_media_id: number | null;
  og_image_id: number | null;
}

function toDraft(event: EventRow | null): Draft {
  return {
    title: event?.title ?? "",
    summary: event?.summary ?? "",
    body_md: event?.body_md ?? "",
    event_date: event?.event_date ?? new Date().toISOString().slice(0, 10),
    end_date: event?.end_date ?? "",
    location: event?.location ?? "",
    role: event?.role ?? "",
    url: event?.url ?? "",
    video_url: event?.video_url ?? "",
    seo_title: event?.seo_title ?? "",
    seo_description: event?.seo_description ?? "",
    status: event?.status === "live" ? "live" : "draft",
    cover_media_id: event?.cover_media_id ?? null,
    og_image_id: event?.og_image_id ?? null,
  };
}

function toGallery(photos: EventPhotoRow[]): GalleryItem[] {
  return photos.map((photo) => ({
    media_id: photo.media_id ?? 0,
    caption: photo.caption ?? "",
    preview: toMediaUrl(photo.r2_key, ""),
  }));
}

/** "" is how a cleared text input reads; the column wants NULL for "not set". */
const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

export function EventEditor({ slug, locale, event, photos, coverUrl, ogImageUrl, onSaved }: Props) {
  const create = useServerFn(createEventFn);
  const update = useServerFn(updateEventFn);
  const remove = useServerFn(deleteEventFn);
  const savePhotos = useServerFn(replaceEventPhotosFn);

  const initial = useMemo(() => toDraft(event), [event]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [coverPreview, setCoverPreview] = useState<string | null>(coverUrl);
  const [ogPreview, setOgPreview] = useState<string | null>(ogImageUrl);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryDirty, setGalleryDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(event));
    setCoverPreview(coverUrl);
    setOgPreview(ogImageUrl);
    setGallery(toGallery(photos));
    setGalleryDirty(false);
  }, [event, photos, coverUrl, ogImageUrl]);

  const changedFields = useMemo(
    () => (Object.keys(initial) as (keyof Draft)[]).filter((key) => draft[key] !== initial[key]),
    [draft, initial],
  );
  const dirtyCount = changedFields.length + (galleryDirty ? 1 : 0);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!draft.title.trim()) {
      toast.error("Tiêu đề bắt buộc.");
      return;
    }
    if (draft.video_url.trim() && !parseYouTubeId(draft.video_url)) {
      toast.error("Link video phải là link YouTube — website chỉ phát được video YouTube.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        summary: orNull(draft.summary),
        body_md: orNull(draft.body_md),
        cover_media_id: draft.cover_media_id,
        og_image_id: draft.og_image_id,
        event_date: draft.event_date,
        end_date: orNull(draft.end_date),
        location: orNull(draft.location),
        role: orNull(draft.role),
        url: orNull(draft.url),
        video_url: orNull(draft.video_url),
        seo_title: orNull(draft.seo_title),
        seo_description: orNull(draft.seo_description),
        status: draft.status,
      };
      // A locale tab with no row yet saves as a create, so adding the EN/ZH
      // version is the same gesture as editing the VI one.
      const saved = event
        ? await update({ data: { id: event.id, ...payload } })
        : await create({ data: { slug, locale, ...payload } });
      if (galleryDirty) {
        await savePhotos({
          data: {
            eventId: saved.event.id,
            photos: gallery
              .filter((photo) => photo.media_id > 0)
              .map((photo) => ({ media_id: photo.media_id, caption: orNull(photo.caption) })),
          },
        });
      }
      toast.success(event ? "Đã lưu Event" : `Đã tạo bản ${LOCALE_LABEL[locale]}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteLocale() {
    if (!event) return;
    if (!confirm(`Xóa bản ${LOCALE_LABEL[locale]} của Event này?`)) return;
    try {
      await remove({ data: { id: event.id } });
      toast.success(`Đã xóa bản ${LOCALE_LABEL[locale]}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  const publicUrl = `https://thgfulfill.com/${locale}/events/${slug}`;

  return (
    <div className="space-y-4">
      {!event && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          Chưa có bản <span className="font-medium text-foreground">{LOCALE_LABEL[locale]}</span>{" "}
          cho Event này. Điền nội dung bên dưới rồi bấm Lưu để tạo.
        </Card>
      )}

      <Card>
        <CardHeader
          title="Nội dung"
          hint={`Hiển thị tại thgfulfill.com/${locale}/events/${slug}`}
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
            hint="Hiện dưới tiêu đề ở trang Event và trên thẻ Event ở trang danh sách."
          >
            <textarea
              value={draft.summary}
              onChange={(e) => set("summary", e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Một hoặc hai câu: sự kiện gì, THG tham gia thế nào."
              className={areaClass}
            />
          </Field>

          <MarkdownEditor
            label="Nội dung chi tiết"
            value={draft.body_md}
            onChange={(value) => set("body_md", value)}
            maxLength={60_000}
            placeholder={
              "## Về sự kiện\n\nSự kiện diễn ra khi nào, ở đâu, dành cho ai…\n\n## THG tại sự kiện\n\n- Vai trò của THG\n- Nội dung chia sẻ\n\n## Tài liệu\n\n- [Slide trình bày](https://…)"
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Thời gian & hình thức tham gia" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Ngày diễn ra" required>
            <input
              type="date"
              value={draft.event_date}
              onChange={(e) => set("event_date", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Ngày kết thúc" hint="Chỉ điền với sự kiện nhiều ngày.">
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) => set("end_date", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Địa điểm">
            <input
              value={draft.location}
              onChange={(e) => set("location", e.target.value)}
              maxLength={200}
              placeholder="TP. Hồ Chí Minh / Online"
              className={inputClass}
            />
          </Field>
          <Field label="THG tham gia với vai trò">
            <input
              value={draft.role}
              onChange={(e) => set("role", e.target.value)}
              maxLength={120}
              list="event-role-suggestions"
              className={inputClass}
            />
            <datalist id="event-role-suggestions">
              {ROLE_SUGGESTIONS.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Video & tài liệu" />
        <div className="space-y-4 p-5">
          <YouTubeUrlField
            label="Link video (YouTube)"
            value={draft.video_url}
            onChange={(value) => set("video_url", value)}
            playsWhere="Website sẽ nhúng trình phát video này ở đầu trang Event — người xem bấm là xem được ngay."
          />
          <Field
            label="Link ngoài (bài đăng, tài liệu, trang đối tác)"
            hint="Hiện thành nút “Tài liệu / thông tin Event” ở cuối trang."
          >
            <input
              value={draft.url}
              onChange={(e) => set("url", e.target.value)}
              maxLength={500}
              placeholder="https://…"
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Hình ảnh" hint="Ảnh bìa dùng cho thẻ Event và ảnh chia sẻ mạng xã hội" />
        <div className="space-y-5 p-5">
          <MediaField
            label="Ảnh bìa"
            mediaId={draft.cover_media_id}
            previewUrl={coverPreview}
            onChange={(id, preview) => {
              set("cover_media_id", id);
              setCoverPreview(preview);
            }}
            pickerTitle="Chọn ảnh bìa Event"
            hint="Có video YouTube thì trang Event hiện trình phát video thay cho ảnh bìa; ảnh bìa vẫn dùng cho thẻ ở trang danh sách."
          />
          <MediaGalleryField
            label="Thư viện ảnh sự kiện"
            items={gallery}
            onChange={(items) => {
              setGallery(items);
              setGalleryDirty(true);
            }}
            max={60}
            pickerTitle="Chọn ảnh sự kiện"
            captionPlaceholder="Chú thích…"
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="SEO & xuất bản" />
        <div className="space-y-4 p-5">
          <Field
            label="SEO title"
            count={{ length: draft.seo_title.length, max: 200, ideal: 60 }}
            hint="Bỏ trống thì dùng tiêu đề Event."
          >
            <input
              value={draft.seo_title}
              onChange={(e) => set("seo_title", e.target.value)}
              maxLength={200}
              placeholder={draft.title ? `${draft.title} | THG Fulfill` : ""}
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
            hint="Ảnh hiện khi chia sẻ link lên Facebook, Zalo, LinkedIn. Kích thước tốt nhất 1200×630. Bỏ trống thì tự dùng ảnh bìa."
          />
          <Field label="Trạng thái" className="max-w-xs">
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value as "draft" | "live")}
              className={inputClass}
            >
              <option value="draft">Nháp — chưa hiển thị</option>
              <option value="live">Xuất bản — hiển thị trên website</option>
            </select>
          </Field>
        </div>
      </Card>

      {event && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDeleteLocale}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:border-red-300 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa bản {LOCALE_LABEL[locale]}
          </button>
        </div>
      )}

      <StickySaveBar
        count={dirtyCount}
        saving={saving}
        onSave={onSave}
        onDiscard={() => {
          setDraft(initial);
          setCoverPreview(coverUrl);
          setOgPreview(ogImageUrl);
          setGallery(toGallery(photos));
          setGalleryDirty(false);
        }}
        hint={
          draft.status === "live"
            ? "Event đang ở trạng thái Xuất bản — bấm Lưu là website cập nhật ngay."
            : "Event đang là bản nháp — lưu xong vẫn chưa hiện trên website."
        }
      />
    </div>
  );
}
