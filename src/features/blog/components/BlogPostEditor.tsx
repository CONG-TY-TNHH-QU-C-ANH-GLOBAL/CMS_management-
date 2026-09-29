import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import { StickySaveBar } from "@/components/cms/StickySaveBar";
import { Field, areaClass, inputClass } from "@/components/cms/article/fields";
import { MarkdownEditor } from "@/components/cms/article/MarkdownEditor";
import { MarkdownPreview } from "@/components/cms/article/MarkdownPreview";
import { MediaField } from "@/components/cms/article/MediaField";
import { MediaGalleryField, type GalleryItem } from "@/components/cms/article/MediaGalleryField";
import {
  replaceBlogSlideMediaFn,
  upsertBlogPostFn,
  type BlogLocale,
  type BlogPostRow,
  type BlogSlideRow,
  type BlogStatus,
} from "@/features/blog/blog.actions";
import { toMediaUrl } from "@/features/partners/partners.media";

interface Props {
  slug: string;
  locale: BlogLocale;
  post: BlogPostRow | null;
  slides: BlogSlideRow[];
  /** Thumbnail resolved to a loadable URL by the loader (bare R2 keys are not). */
  thumbnailPreview: string | null;
  /** Categories already in use, for the suggestion list. */
  categories: string[];
  /** EN/ZH tab whose content is the reviewed AI translation of the VI post —
   *  there is no row of its own to edit here. */
  isTranslation: boolean;
  /** The translation carries no body of its own, so the site shows the VI body. */
  bodyUntranslated: boolean;
  onOpenTranslations: () => void;
  onSaved: () => void | Promise<void>;
}

const LOCALE_LABEL: Record<BlogLocale, string> = {
  vi: "Tiếng Việt",
  en: "English",
  zh: "中文",
};

const STATUS_OPTIONS: { value: BlogStatus; label: string }[] = [
  { value: "draft", label: "Nháp — chưa hiển thị" },
  { value: "review", label: "Chờ duyệt — chưa hiển thị" },
  { value: "live", label: "Xuất bản — hiển thị trên website" },
  { value: "archived", label: "Đã ẩn — gỡ khỏi website" },
];

interface Draft {
  title: string;
  excerpt: string;
  body_md: string;
  category: string;
  published_date: string;
  status: BlogStatus;
  seo_title: string;
  seo_description: string;
  thumbnail_media_id: number | null;
}

function toDraft(post: BlogPostRow | null): Draft {
  return {
    title: post?.title ?? "",
    excerpt: post?.excerpt ?? "",
    body_md: post?.body_md ?? "",
    category: post?.category ?? "",
    published_date: post?.published_date ?? "",
    status: post?.status ?? "draft",
    seo_title: post?.seo_title ?? "",
    seo_description: post?.seo_description ?? "",
    thumbnail_media_id: post?.thumbnail_media_id ?? null,
  };
}

function toGallery(slides: BlogSlideRow[]): GalleryItem[] {
  return slides.map((slide) => ({
    media_id: slide.media_id,
    caption: slide.alt_text,
    preview: toMediaUrl(slide.src, ""),
  }));
}

/** "" is how a cleared text input reads; the column wants NULL for "not set". */
const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

export function BlogPostEditor(props: Props) {
  if (props.isTranslation && props.post) {
    return <TranslationView {...props} post={props.post} />;
  }
  return <PostForm {...props} />;
}

function PostForm({
  slug,
  locale,
  post,
  slides,
  thumbnailPreview,
  categories,
  onOpenTranslations,
  onSaved,
}: Props) {
  const upsert = useServerFn(upsertBlogPostFn);
  const saveSlides = useServerFn(replaceBlogSlideMediaFn);

  const initial = useMemo(() => toDraft(post), [post]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [thumbPreview, setThumbPreview] = useState<string | null>(thumbnailPreview);
  const [gallery, setGallery] = useState<GalleryItem[]>(() => toGallery(slides));
  const [galleryDirty, setGalleryDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(post));
    setThumbPreview(thumbnailPreview);
    setGallery(toGallery(slides));
    setGalleryDirty(false);
  }, [post, slides, thumbnailPreview]);

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
      await upsert({
        data: {
          slug,
          locale,
          title: draft.title.trim(),
          excerpt: orNull(draft.excerpt),
          body_md: orNull(draft.body_md),
          category: orNull(draft.category),
          published_date: orNull(draft.published_date),
          status: draft.status,
          seo_title: orNull(draft.seo_title),
          seo_description: orNull(draft.seo_description),
          thumbnail_media_id: draft.thumbnail_media_id,
        },
      });
      // After the upsert: a brand-new locale row has to exist before slides can hang off it.
      if (galleryDirty) {
        await saveSlides({
          data: {
            slug,
            locale,
            slides: gallery
              .filter((item) => item.media_id > 0)
              .map((item) => ({
                media_id: item.media_id,
                alt_text: (item.caption.trim() || draft.title.trim()).slice(0, 200),
              })),
          },
        });
      }
      toast.success(
        post ? `Đã lưu bản ${LOCALE_LABEL[locale]}` : `Đã tạo bản ${LOCALE_LABEL[locale]}`,
      );
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  const publicUrl = `https://thgfulfill.com/${locale}/blog/${slug}`;

  return (
    <div className="space-y-4">
      {!post && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          Chưa có bản <span className="font-medium text-foreground">{LOCALE_LABEL[locale]}</span>{" "}
          cho bài này.
          {locale !== "vi" && (
            <>
              {" "}
              Cách nên làm: về tab Tiếng Việt, bấm{" "}
              <button
                type="button"
                onClick={onOpenTranslations}
                className="font-medium text-primary underline"
              >
                Bản dịch EN + ZH
              </button>{" "}
              để dịch tự động rồi duyệt. Chỉ tự viết ở đây khi muốn một bản riêng không theo bài
              tiếng Việt.
            </>
          )}
        </Card>
      )}

      <Card>
        <CardHeader
          title="Nội dung"
          hint={`Hiển thị tại thgfulfill.com/${locale}/blog/${slug}`}
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
          <Field label="Tiêu đề" required count={{ length: draft.title.length, max: 500 }}>
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={500}
              className={inputClass}
            />
          </Field>

          <Field
            label="Tóm tắt"
            count={{ length: draft.excerpt.length, max: 2000, ideal: 300 }}
            hint="Hiện in nghiêng ở đầu bài và trên thẻ bài ở trang Blog."
          >
            <textarea
              value={draft.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="1–2 câu: bài này trả lời câu hỏi gì cho seller."
              className={areaClass}
            />
          </Field>

          <MarkdownEditor
            label="Nội dung bài viết"
            value={draft.body_md}
            onChange={(value) => set("body_md", value)}
            maxLength={100_000}
            rows={22}
            placeholder={
              "## Câu hỏi bài viết trả lời\n\nTrả lời ngắn trước, sau đó giải thích kèm ví dụ…\n\n## Các bước / các khoản cần biết\n\n- **Ý 1**: mô tả\n- **Ý 2**: mô tả\n\n## Điều kiện áp dụng và bước tiếp theo với THG\n\n…"
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Phân loại & ngày đăng" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Danh mục" hint="Chọn danh mục có sẵn để bài hiện đúng bộ lọc ở trang Blog.">
            <input
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              maxLength={100}
              list={`blog-categories-${slug}`}
              className={inputClass}
            />
            <datalist id={`blog-categories-${slug}`}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Ngày đăng" hint="Bỏ trống thì website dùng ngày cập nhật gần nhất.">
            <input
              type="date"
              value={draft.published_date}
              onChange={(e) => set("published_date", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Hình ảnh"
          hint="Chọn từ thư viện media hoặc tải ảnh mới lên (dán bằng Ctrl+V)"
        />
        <div className="space-y-5 p-5">
          <MediaField
            label="Ảnh đại diện (thumbnail)"
            mediaId={draft.thumbnail_media_id}
            previewUrl={thumbPreview}
            onChange={(id, preview) => {
              set("thumbnail_media_id", id);
              setThumbPreview(preview);
            }}
            pickerTitle="Chọn ảnh đại diện bài viết"
            hint="Hiện trên thẻ bài ở trang Blog. Bài không có ảnh bài viết thì ảnh này hiện lớn ở đầu bài."
          />
          <MediaGalleryField
            label="Ảnh bài viết"
            items={gallery}
            onChange={(items) => {
              setGallery(items);
              setGalleryDirty(true);
            }}
            max={100}
            pickerTitle="Chọn ảnh bài viết"
            captionPlaceholder="Mô tả ảnh (alt)…"
            firstBadge="Ảnh lớn"
            hint="Ảnh đầu tiên hiện lớn ở đầu bài, các ảnh sau thành thư viện cuối bài. Muốn đặt ảnh giữa bài, dùng nút chèn ảnh trong khung nội dung."
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="SEO & xuất bản" />
        <div className="space-y-4 p-5">
          <Field
            label="Tiêu đề trên Google"
            count={{ length: draft.seo_title.length, max: 200, ideal: 60 }}
            hint="Bỏ trống thì dùng tiêu đề bài."
          >
            <input
              value={draft.seo_title}
              onChange={(e) => set("seo_title", e.target.value)}
              maxLength={200}
              placeholder={draft.title}
              className={inputClass}
            />
          </Field>
          <Field
            label="Mô tả trên Google"
            count={{ length: draft.seo_description.length, max: 500, ideal: 160 }}
            hint="Bỏ trống thì dùng tóm tắt."
          >
            <textarea
              value={draft.seo_description}
              onChange={(e) => set("seo_description", e.target.value)}
              maxLength={500}
              rows={2}
              className={areaClass}
            />
          </Field>
          <Field label="Trạng thái" className="max-w-xs">
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value as BlogStatus)}
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

      <StickySaveBar
        count={dirtyCount}
        saving={saving}
        onSave={onSave}
        onDiscard={() => {
          setDraft(initial);
          setThumbPreview(thumbnailPreview);
          setGallery(toGallery(slides));
          setGalleryDirty(false);
        }}
        hint={
          draft.status === "live"
            ? "Bài đang ở trạng thái Xuất bản — bấm Lưu là website cập nhật ngay."
            : "Bài chưa xuất bản — lưu xong vẫn chưa hiện trên website."
        }
      />
    </div>
  );
}

/**
 * EN/ZH content that comes from the reviewed translation of the VI post. The
 * old editor showed it as an editable form, but saving there wrote a separate
 * legacy row the website ignores while the translation exists — edits vanished.
 */
function TranslationView({
  locale,
  slug,
  post,
  bodyUntranslated,
  onOpenTranslations,
}: Props & { post: BlogPostRow }) {
  return (
    <div className="space-y-4">
      {/* Plain divs, not Card: Card's own bg-card would override the tint. */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p>
          Bản <span className="font-medium">{LOCALE_LABEL[locale]}</span> đang hiển thị trên website
          là <span className="font-medium">bản dịch đã duyệt</span> của bài Tiếng Việt, nên không
          sửa trực tiếp ở đây. Sửa bản dịch bằng nút bên dưới.
        </p>
        <button
          type="button"
          onClick={onOpenTranslations}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          <Sparkles className="h-3.5 w-3.5" /> Mở bản dịch EN + ZH
        </button>
      </div>

      {bodyUntranslated && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Thân bài chưa có bản dịch — trang {LOCALE_LABEL[locale]} đang hiện thân bài tiếng Việt
          dưới tiêu đề đã dịch.
        </div>
      )}

      <Card>
        <CardHeader
          title={post.title}
          hint={post.excerpt ?? undefined}
          action={
            <a
              href={`https://thgfulfill.com/${locale}/blog/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Xem trên trang thật
            </a>
          }
        />
        <div className="p-5">
          <MarkdownPreview markdown={post.body_md ?? ""} />
        </div>
      </Card>
    </div>
  );
}
