import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import { StickySaveBar } from "@/components/cms/StickySaveBar";
import { MediaPicker } from "@/features/media/components/MediaPicker";
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

/** "" is how a cleared text input reads; the column wants NULL for "not set". */
const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

interface PhotoDraft {
  media_id: number;
  caption: string;
  preview: string | null;
}

export function EventEditor({ slug, locale, event, photos, coverUrl, ogImageUrl, onSaved }: Props) {
  const create = useServerFn(createEventFn);
  const update = useServerFn(updateEventFn);
  const remove = useServerFn(deleteEventFn);
  const savePhotos = useServerFn(replaceEventPhotosFn);

  const initial = useMemo(() => toDraft(event), [event]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [coverPreview, setCoverPreview] = useState<string | null>(coverUrl);
  const [ogPreview, setOgPreview] = useState<string | null>(ogImageUrl);
  const [gallery, setGallery] = useState<PhotoDraft[]>([]);
  const [galleryDirty, setGalleryDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(event));
    setCoverPreview(coverUrl);
    setOgPreview(ogImageUrl);
    setGallery(
      photos.map((photo) => ({
        media_id: photo.media_id ?? 0,
        caption: photo.caption ?? "",
        preview: toMediaUrl(photo.r2_key, ""),
      })),
    );
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

  const inputClass = "mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";
  const areaClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

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
              href={`https://thgfulfill.com/${locale}/events/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Xem trên trang thật
            </a>
          }
        />
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm font-medium">Tiêu đề</span>
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={200}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Tóm tắt</span>
            <textarea
              value={draft.summary}
              onChange={(e) => set("summary", e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Một hoặc hai câu hiển thị trên thẻ Event ở trang danh sách."
              className={areaClass}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Nội dung chi tiết (Markdown)</span>
            <textarea
              value={draft.body_md}
              onChange={(e) => set("body_md", e.target.value)}
              maxLength={60_000}
              rows={18}
              spellCheck={false}
              placeholder={"## Tiêu đề mục\n\nNội dung…\n\n- [Tài liệu](https://…)"}
              className={`${areaClass} font-mono leading-relaxed`}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Hỗ trợ Markdown: ## tiêu đề, **in đậm**, danh sách, [liên kết](url), &gt; trích dẫn.
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Thời gian & hình thức tham gia" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Ngày diễn ra</span>
            <input
              type="date"
              value={draft.event_date}
              onChange={(e) => set("event_date", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Ngày kết thúc</span>
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) => set("end_date", e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Chỉ điền với sự kiện nhiều ngày.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Địa điểm</span>
            <input
              value={draft.location}
              onChange={(e) => set("location", e.target.value)}
              maxLength={200}
              placeholder="TP. Hồ Chí Minh / Online"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">THG tham gia với vai trò</span>
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
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Ảnh & video"
          hint="Ảnh bìa dùng cho thẻ Event và ảnh chia sẻ mạng xã hội"
        />
        <div className="space-y-4 p-5">
          <div>
            <span className="text-sm font-medium">Ảnh bìa</span>
            <div className="mt-2 flex items-center gap-3">
              {coverPreview ? (
                <img
                  src={coverPreview}
                  alt=""
                  className="h-20 w-36 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="grid h-20 w-36 place-items-center rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
                  Chưa có ảnh
                </div>
              )}
              <MediaPicker
                mode="single"
                value={draft.cover_media_id ? [draft.cover_media_id] : []}
                onChange={(ids, rows) => {
                  set("cover_media_id", ids[0] ?? null);
                  setCoverPreview(rows[0]?.url ?? rows[0]?.thumb_url ?? null);
                }}
                title="Chọn ảnh bìa Event"
                trigger={
                  <button
                    type="button"
                    className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                  >
                    Chọn ảnh bìa
                  </button>
                }
              />
              {draft.cover_media_id && (
                <button
                  type="button"
                  onClick={() => {
                    set("cover_media_id", null);
                    setCoverPreview(null);
                  }}
                  className="text-sm text-muted-foreground hover:text-red-600"
                >
                  Bỏ ảnh bìa
                </button>
              )}
            </div>
            <span className="mt-2 block text-[11px] text-muted-foreground">
              Không chọn ảnh bìa mà có link YouTube thì trang Event tự lấy ảnh thumbnail của video.
            </span>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Link video (YouTube)</span>
            <input
              value={draft.video_url}
              onChange={(e) => set("video_url", e.target.value)}
              maxLength={500}
              placeholder="https://youtu.be/…"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">
              Link ngoài (bài đăng, tài liệu, trang đối tác)
            </span>
            <input
              value={draft.url}
              onChange={(e) => set("url", e.target.value)}
              maxLength={500}
              placeholder="https://…"
              className={inputClass}
            />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Thư viện ảnh sự kiện</span>
              <span className="text-xs text-muted-foreground">
                {gallery.length} ảnh — tối đa 60
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-start gap-3">
              {gallery.map((photo, index) => (
                <div key={`${photo.media_id}-${index}`} className="w-32 space-y-1">
                  {photo.preview ? (
                    <img
                      src={photo.preview}
                      alt=""
                      className="h-20 w-32 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-32 place-items-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                      #{photo.media_id}
                    </div>
                  )}
                  <input
                    value={photo.caption}
                    onChange={(e) => {
                      const caption = e.target.value;
                      setGallery((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, caption } : item)),
                      );
                      setGalleryDirty(true);
                    }}
                    maxLength={300}
                    placeholder="Chú thích…"
                    className="h-7 w-full rounded-md border border-border bg-background px-2 text-[11px]"
                  />
                </div>
              ))}
              <MediaPicker
                mode="multi"
                value={gallery.map((photo) => photo.media_id)}
                onChange={(ids, rows) => {
                  const previewById = new Map(
                    rows.map((row) => [row.id, row.url ?? row.thumb_url ?? null]),
                  );
                  const captionById = new Map(gallery.map((p) => [p.media_id, p.caption]));
                  setGallery(
                    ids.slice(0, 60).map((id) => ({
                      media_id: id,
                      caption: captionById.get(id) ?? "",
                      preview: previewById.get(id) ?? null,
                    })),
                  );
                  setGalleryDirty(true);
                }}
                title="Chọn ảnh sự kiện"
                trigger={
                  <button
                    type="button"
                    className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                  >
                    Thêm / sửa ảnh
                  </button>
                }
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="SEO & xuất bản" />
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm font-medium">SEO title</span>
            <input
              value={draft.seo_title}
              onChange={(e) => set("seo_title", e.target.value)}
              maxLength={200}
              placeholder={draft.title ? `${draft.title} | THG Fulfill` : ""}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">SEO description</span>
            <textarea
              value={draft.seo_description}
              onChange={(e) => set("seo_description", e.target.value)}
              maxLength={300}
              rows={2}
              className={areaClass}
            />
          </label>
          <div>
            <span className="text-sm font-medium">Ảnh chia sẻ mạng xã hội (OG image)</span>
            <div className="mt-2 flex items-center gap-3">
              {ogPreview ? (
                <img
                  src={ogPreview}
                  alt=""
                  className="h-20 w-36 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="grid h-20 w-36 place-items-center rounded-lg border border-dashed border-border text-center text-[11px] text-muted-foreground">
                  Dùng ảnh bìa
                </div>
              )}
              <MediaPicker
                mode="single"
                value={draft.og_image_id ? [draft.og_image_id] : []}
                onChange={(ids, rows) => {
                  set("og_image_id", ids[0] ?? null);
                  setOgPreview(rows[0]?.url ?? rows[0]?.thumb_url ?? null);
                }}
                title="Chọn ảnh chia sẻ mạng xã hội"
                trigger={
                  <button
                    type="button"
                    className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                  >
                    Chọn ảnh OG
                  </button>
                }
              />
              {draft.og_image_id && (
                <button
                  type="button"
                  onClick={() => {
                    set("og_image_id", null);
                    setOgPreview(null);
                  }}
                  className="text-sm text-muted-foreground hover:text-red-600"
                >
                  Bỏ ảnh OG
                </button>
              )}
            </div>
            <span className="mt-2 block text-[11px] text-muted-foreground">
              Ảnh hiện khi chia sẻ link lên Facebook, Zalo, LinkedIn. Kích thước tốt nhất 1200×630.
              Bỏ trống thì tự dùng ảnh bìa.
            </span>
          </div>

          <label className="block max-w-xs">
            <span className="text-sm font-medium">Trạng thái</span>
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value as "draft" | "live")}
              className={inputClass}
            >
              <option value="draft">Nháp — chưa hiển thị</option>
              <option value="live">Xuất bản — hiển thị trên landing</option>
            </select>
          </label>
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
          setGallery(
            photos.map((photo) => ({
              media_id: photo.media_id ?? 0,
              caption: photo.caption ?? "",
              preview: toMediaUrl(photo.r2_key, ""),
            })),
          );
          setGalleryDirty(false);
        }}
      />
    </div>
  );
}
