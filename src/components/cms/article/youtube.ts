/**
 * YouTube link helpers for the article editor.
 *
 * Mirrors `parseYouTubeId` in THG_landingpage/src/lib/youtube.ts on purpose:
 * the editor promises "this link will play on the website", so it has to
 * accept exactly the link shapes the website accepts — no more, no less.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = url.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // Pasted without a scheme ("youtube.com/watch?v=…") — try https.
    try {
      u = new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const idOk = (s: string | null | undefined): string | null => (s && ID.test(s) ? s : null);
  if (host === "youtu.be") return idOk(u.pathname.split("/").filter(Boolean)[0]);
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") return idOk(u.searchParams.get("v"));
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["shorts", "embed", "v", "live"].includes(parts[0])) {
      return idOk(parts[1]);
    }
  }
  return null;
}

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeEmbedSrc(id: string): string {
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

/** Canonical short link written into the body, so every inserted video reads the same. */
export function youtubeShortUrl(id: string): string {
  return `https://youtu.be/${id}`;
}
