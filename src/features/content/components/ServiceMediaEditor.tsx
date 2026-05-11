// Editor for service-level (locale-agnostic) media: gallery, videos, products.
// Saves to services.gallery_json / videos_json / products_json via updateServiceBaseFn.

import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import { MediaPicker } from "@/features/media/components/MediaPicker";
import { updateServiceBaseFn } from "@/features/content/content.actions";

interface GalleryItem {
  url?: string;
  media_id?: number;
  alt?: string;
}
interface VideoItem {
  youtube_id: string;
  caption_key?: string;
  caption?: string;
}
interface ProductItem {
  name: string;
  price?: string;
  time?: string;
  origin?: string;
  image?: string;
  media_id?: number;
}

interface Props {
  serviceId: string;
  gallery: GalleryItem[];
  videos: VideoItem[];
  products: ProductItem[];
}

/** Extract YouTube videoId from any common URL shape; returns "" on failure. */
function extractYouTubeId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[A-Za-z0-9_-]{11}$/.test(last)) return last;
  } catch {
    // fall through
  }
  return "";
}

export function ServiceMediaEditor({ serviceId, gallery, videos, products }: Props) {
  const router = useRouter();
  const updateBase = useServerFn(updateServiceBaseFn);
  const [galleryList, setGalleryList] = useState<GalleryItem[]>(gallery);
  const [videosList, setVideosList] = useState<VideoItem[]>(videos);
  const [productsList, setProductsList] = useState<ProductItem[]>(products);
  const [pending, setPending] = useState(false);
  const galleryTag = `service-${serviceId}-gallery`;
  const productTag = `service-${serviceId}-product`;

  function move<T>(list: T[], setter: (next: T[]) => void, i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[i], next[target]] = [next[target], next[i]];
    setter(next);
  }

  function updateVideo(idx: number, field: keyof VideoItem, value: string) {
    setVideosList((v) => v.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }

  function updateProduct(idx: number, field: keyof ProductItem, value: string) {
    setProductsList((p) =>
      p.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    );
  }

  async function save() {
    setPending(true);
    try {
      // Sanitize before save
      const cleanGallery = galleryList.filter((g) => g.url || g.media_id);
      const cleanVideos = videosList
        .map((v) => ({ ...v, youtube_id: extractYouTubeId(v.youtube_id) || v.youtube_id }))
        .filter((v) => v.youtube_id);
      const cleanProducts = productsList.filter((p) => p.name.trim());
      await updateBase({
        data: {
          id: serviceId,
          gallery: cleanGallery,
          videos: cleanVideos,
          products: cleanProducts,
        },
      });
      toast.success("Đã lưu ảnh / video / sản phẩm");
      setGalleryList(cleanGallery);
      setVideosList(cleanVideos);
      setProductsList(cleanProducts);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-5 space-y-6">
        {/* Gallery */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <CardHeader
              title={`Thư viện ảnh dịch vụ (${galleryList.length})`}
              hint="Ảnh slider / showcase hiển thị trên trang dịch vụ. Có thể chọn từ thư viện hoặc dán URL trực tiếp."
            />
            <MediaPicker
              mode="multi"
              value={galleryList.map((g) => g.media_id).filter((x): x is number => typeof x === "number")}
              defaultTag={galleryTag}
              title="Chọn ảnh cho gallery"
              onChange={(_, rows) => {
                setGalleryList(rows.map((r) => ({ media_id: r.id, alt: r.alt_text })));
              }}
              trigger={
                <button type="button" className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted">
                  <ImagePlus className="w-3.5 h-3.5" /> Chọn từ thư viện
                </button>
              }
            />
          </div>
          {galleryList.length === 0 ? (
            <div className="text-xs text-muted-foreground italic px-1">Chưa có ảnh. Bấm "Chọn từ thư viện" để thêm.</div>
          ) : (
            <ul className="space-y-2">
              {galleryList.map((g, i) => (
                <li key={i} className="flex gap-2 p-2 rounded-md border border-border bg-surface-muted/30 items-center">
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => move(galleryList, setGalleryList, i, -1)} disabled={i === 0} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                    <button type="button" onClick={() => move(galleryList, setGalleryList, i, +1)} disabled={i === galleryList.length - 1} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                  </div>
                  {(g.url || (g.media_id && `/api/v1/media/`)) && (
                    <img
                      src={g.url ?? ""}
                      alt={g.alt ?? ""}
                      className="w-14 h-14 object-cover rounded border border-border"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <input
                    type="text"
                    placeholder="URL ảnh (hoặc media_id)"
                    value={g.url ?? ""}
                    onChange={(e) => setGalleryList((l) => l.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))}
                    className="flex-1 h-8 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="text"
                    placeholder="Mô tả ảnh (alt)"
                    value={g.alt ?? ""}
                    onChange={(e) => setGalleryList((l) => l.map((x, idx) => (idx === i ? { ...x, alt: e.target.value } : x)))}
                    className="w-40 h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button type="button" onClick={() => setGalleryList((l) => l.filter((_, idx) => idx !== i))} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Videos */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <CardHeader
              title={`Video YouTube (${videosList.length})`}
              hint="Dán link YouTube — hệ thống tự lấy mã video. Caption hiển thị dưới video."
            />
            <button
              type="button"
              onClick={() => setVideosList((v) => [...v, { youtube_id: "" }])}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm video
            </button>
          </div>
          {videosList.length === 0 ? (
            <div className="text-xs text-muted-foreground italic px-1">Chưa có video.</div>
          ) : (
            <ul className="space-y-2">
              {videosList.map((v, i) => (
                <li key={i} className="flex gap-2 p-2 rounded-md border border-border bg-surface-muted/30 items-center">
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => move(videosList, setVideosList, i, -1)} disabled={i === 0} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                    <button type="button" onClick={() => move(videosList, setVideosList, i, +1)} disabled={i === videosList.length - 1} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                  </div>
                  <input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=… hoặc mã 11 ký tự"
                    value={v.youtube_id}
                    onChange={(e) => updateVideo(i, "youtube_id", e.target.value)}
                    className="flex-1 h-8 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="text"
                    placeholder="Caption (hoặc translation key)"
                    value={v.caption ?? v.caption_key ?? ""}
                    onChange={(e) => updateVideo(i, "caption", e.target.value)}
                    className="w-56 h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button type="button" onClick={() => setVideosList((l) => l.filter((_, idx) => idx !== i))} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Products (THG_Fulfill specifically) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <CardHeader
              title={`Sản phẩm showcase (${productsList.length})`}
              hint="Các thẻ sản phẩm hiển thị trên trang dịch vụ (chủ yếu THG_Fulfill). Để trống nếu không cần."
            />
            <button
              type="button"
              onClick={() => setProductsList((p) => [...p, { name: "", price: "", time: "", origin: "" }])}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm sản phẩm
            </button>
          </div>
          {productsList.length === 0 ? (
            <div className="text-xs text-muted-foreground italic px-1">Chưa có sản phẩm.</div>
          ) : (
            <ul className="space-y-2">
              {productsList.map((p, i) => (
                <li key={i} className="p-3 rounded-md border border-border bg-surface-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex flex-col gap-0.5">
                      <button type="button" onClick={() => move(productsList, setProductsList, i, -1)} disabled={i === 0} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                      <button type="button" onClick={() => move(productsList, setProductsList, i, +1)} disabled={i === productsList.length - 1} className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                    </div>
                    {p.image && (
                      <img src={p.image} alt={p.name} className="w-16 h-16 object-cover rounded border border-border" />
                    )}
                    <div className="flex-1 grid sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Tên sản phẩm"
                        value={p.name}
                        onChange={(e) => updateProduct(i, "name", e.target.value)}
                        className="h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="text"
                        placeholder="Giá (vd: $10.83)"
                        value={p.price ?? ""}
                        onChange={(e) => updateProduct(i, "price", e.target.value)}
                        className="h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="text"
                        placeholder="Thời gian (vd: 3-5 days)"
                        value={p.time ?? ""}
                        onChange={(e) => updateProduct(i, "time", e.target.value)}
                        className="h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="text"
                        placeholder="Xuất xứ (vd: Việt Nam 🇻🇳)"
                        value={p.origin ?? ""}
                        onChange={(e) => updateProduct(i, "origin", e.target.value)}
                        className="h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <button type="button" onClick={() => setProductsList((l) => l.filter((_, idx) => idx !== i))} className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="URL ảnh sản phẩm"
                      value={p.image ?? ""}
                      onChange={(e) => updateProduct(i, "image", e.target.value)}
                      className="flex-1 h-8 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MediaPicker
                      mode="single"
                      value={p.media_id ? [p.media_id] : []}
                      defaultTag={productTag}
                      title="Chọn ảnh sản phẩm"
                      onChange={(_, rows) => {
                        const r = rows[0];
                        if (!r) return;
                        setProductsList((l) =>
                          l.map((x, idx) => (idx === i ? { ...x, media_id: r.id, image: r.url ?? x.image } : x)),
                        );
                      }}
                      trigger={
                        <button type="button" className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted whitespace-nowrap">
                          <ImagePlus className="w-3.5 h-3.5" /> Chọn ảnh
                        </button>
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="border-t border-border bg-surface-muted/40 px-5 py-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Ảnh / video / sản phẩm dùng chung cho 3 ngôn ngữ.
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {pending ? "Đang lưu..." : "Lưu ảnh / video / sản phẩm"}
        </button>
      </div>
    </Card>
  );
}
