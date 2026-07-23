// Blog Auto-Bot — image resolution (Phase 2).
//
// Turns a generated article into a relevant hero photo (+ optional slides) and
// attaches them by DOWNLOADING the source into our own R2 bucket (via
// media.service uploadMedia) — we never hotlink a third-party CDN, so the
// landing serves images from our domain and nothing breaks if the source URL
// rotates.
//
// Modes (campaign.image_mode):
//   'stock'       → royalty-free photo search: Pexels (primary), Unsplash
//                   (fallback). Relevance comes from the article's
//                   image_keywords (LLM-derived, English).
//   'ai_generate' → OpenAI Images (dall-e-3) — uses OPENAI_API_KEY.
//   'none'        → no images.
//
// Best-effort: any image failure returns a `warning` (never throws). The
// caller keeps the article draft and surfaces the warning on the run.

import type { BlogBotCampaignRow } from "@/features/blog-bot/blog-bot.service";
import type { GeneratedArticle } from "@/features/blog-bot/blog-bot.openai";

export interface ImageEnv {
  PEXELS_API_KEY?: string;
  UNSPLASH_ACCESS_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
}

export interface ImageAsset {
  url: string;
  alt: string;
}

export interface ImageResult {
  thumbnail: ImageAsset | null;
  slides: ImageAsset[];
  costUsd: number;
  provider: string | null;
  warning: string | null;
}

const FETCH_TIMEOUT_MS = 20_000; // stock search + image download
const IMAGE_GEN_TIMEOUT_MS = 90_000; // dall-e-3 can take 30-60s to render
const DALLE_COST_USD = 0.08; // dall-e-3 1792x1024 standard (approx)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB guard

const EMPTY: ImageResult = {
  thumbnail: null,
  slides: [],
  costUsd: 0,
  provider: null,
  warning: null,
};

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Build the (English) stock/image query from the article's keywords, falling
 *  back to the title. */
function buildQuery(article: GeneratedArticle): string {
  const kws = article.image_keywords.filter((k) => k.trim()).slice(0, 4);
  if (kws.length > 0) return kws.join(" ");
  return article.title;
}

interface StockPhoto {
  url: string;
  alt: string;
}

async function searchPexels(apiKey: string, query: string, count: number): Promise<StockPhoto[]> {
  const u = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${count}`;
  const res = await fetchWithTimeout(u, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const body = (await res.json()) as {
    photos?: Array<{
      alt?: string | null;
      src?: { large2x?: string; large?: string; landscape?: string; original?: string };
    }>;
  };
  const out: StockPhoto[] = [];
  for (const p of body.photos ?? []) {
    const url = p.src?.large2x ?? p.src?.large ?? p.src?.landscape ?? p.src?.original;
    if (url) out.push({ url, alt: (p.alt ?? "").trim() });
  }
  return out;
}

async function searchUnsplash(
  accessKey: string,
  query: string,
  count: number,
): Promise<StockPhoto[]> {
  const u = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${count}`;
  const res = await fetchWithTimeout(u, { headers: { Authorization: `Client-ID ${accessKey}` } });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const body = (await res.json()) as {
    results?: Array<{
      alt_description?: string | null;
      urls?: { regular?: string; full?: string; small?: string };
    }>;
  };
  const out: StockPhoto[] = [];
  for (const p of body.results ?? []) {
    const url = p.urls?.regular ?? p.urls?.full ?? p.urls?.small;
    if (url) out.push({ url, alt: (p.alt_description ?? "").trim() });
  }
  return out;
}

/** dall-e-3 image generation → returns a temporary source URL. */
async function generateAiImageUrl(env: ImageEnv, prompt: string): Promise<string> {
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/images/generations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt.slice(0, 3900),
        n: 1,
        size: "1792x1024",
      }),
    },
    IMAGE_GEN_TIMEOUT_MS,
  );
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const b = (await res.json()) as { error?: { message?: string } };
      if (b.error?.message) detail = b.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`OpenAI images: ${detail}`);
  }
  const body = (await res.json()) as { data?: Array<{ url?: string }> };
  const url = body.data?.[0]?.url;
  if (!url) throw new Error("OpenAI images: không có URL trả về");
  return url;
}

/** Fetch an image URL and store it in R2, returning our own public URL. */
async function downloadToR2(actorId: number, sourceUrl: string, alt: string): Promise<string> {
  const res = await fetchWithTimeout(sourceUrl);
  if (!res.ok) throw new Error(`tải ảnh thất bại (${res.status})`);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error(`nguồn không phải ảnh (${mime})`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error("ảnh rỗng");
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("ảnh quá lớn");
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const { uploadMedia } = await import("@/features/media/media.service");
  const row = await uploadMedia(actorId, {
    filename: `blog-bot.${ext}`,
    mime,
    bytes: buf.byteLength,
    body: buf,
    alt_text: alt.slice(0, 200),
    tag: "blog-bot",
  });
  if (!row.url) throw new Error("upload R2 không trả URL");
  return row.url;
}

/** Resolve images for a generated article per the campaign's image_mode.
 *  Never throws — failures surface as `warning`. Downloads everything to R2. */
export async function resolveImages(
  env: ImageEnv,
  campaign: BlogBotCampaignRow,
  article: GeneratedArticle,
  actorId: number,
): Promise<ImageResult> {
  if (campaign.image_mode === "none") return EMPTY;

  const altBase = article.title;

  // ── Stock: Pexels primary, Unsplash fallback. Up to 3 photos (1 thumb + 2). ──
  if (campaign.image_mode === "stock") {
    if (!env.PEXELS_API_KEY && !env.UNSPLASH_ACCESS_KEY) {
      return { ...EMPTY, warning: "Chưa set PEXELS_API_KEY/UNSPLASH_ACCESS_KEY — bỏ qua ảnh." };
    }
    const query = buildQuery(article);
    let photos: StockPhoto[] = [];
    let provider: string | null = null;
    try {
      if (env.PEXELS_API_KEY) {
        photos = await searchPexels(env.PEXELS_API_KEY, query, 3);
        provider = "pexels";
      }
      if (photos.length === 0 && env.UNSPLASH_ACCESS_KEY) {
        photos = await searchUnsplash(env.UNSPLASH_ACCESS_KEY, query, 3);
        provider = "unsplash";
      }
    } catch (err) {
      return {
        ...EMPTY,
        warning: `Tìm ảnh thất bại: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (photos.length === 0) {
      return { ...EMPTY, provider, warning: `Không tìm thấy ảnh phù hợp cho "${query}".` };
    }

    const assets: ImageAsset[] = [];
    for (const p of photos) {
      try {
        const url = await downloadToR2(actorId, p.url, p.alt || altBase);
        assets.push({ url, alt: p.alt || altBase });
      } catch {
        /* skip this photo, try the next */
      }
    }
    if (assets.length === 0) {
      return { ...EMPTY, provider, warning: "Tải ảnh về R2 thất bại." };
    }
    return {
      thumbnail: assets[0],
      slides: assets.slice(1),
      costUsd: 0,
      provider,
      warning: null,
    };
  }

  // ── AI generate: one hero image via dall-e-3. ──
  if (campaign.image_mode === "ai_generate") {
    if (!env.OPENAI_API_KEY) {
      return { ...EMPTY, warning: "Chưa set OPENAI_API_KEY — bỏ qua ảnh AI." };
    }
    const subject = buildQuery(article);
    const style = campaign.image_style?.trim() ? `, style: ${campaign.image_style.trim()}` : "";
    const prompt = `A high-quality, professional blog hero photograph about: ${subject}${style}. Realistic, clean composition, no text, no logos, no watermarks.`;
    try {
      const sourceUrl = await generateAiImageUrl(env, prompt);
      const url = await downloadToR2(actorId, sourceUrl, altBase);
      return {
        thumbnail: { url, alt: altBase },
        slides: [],
        costUsd: DALLE_COST_USD,
        provider: "openai",
        warning: null,
      };
    } catch (err) {
      return {
        ...EMPTY,
        warning: `Sinh ảnh AI thất bại: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return EMPTY;
}
