import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";

import { parseYouTubeId, youtubeEmbedSrc } from "./youtube";
import { articleOutline } from "./article-outline";

/**
 * Renders article Markdown the way thgfulfill.com does (react-markdown +
 * remark-gfm, same versions as the landing), including the one rule the
 * website adds on top: a paragraph holding nothing but a YouTube link becomes
 * a playable video. Keep `soleYouTubeLink` in step with the landing's
 * ArticleMarkdown or the preview will promise something the site won't do.
 */

const SITE = "https://thgfulfill.com";

function ArticleVideo({ id, label }: { id: string; label: string | null }) {
  const [playing, setPlaying] = useState(false);
  return <figure className="my-6">
    <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
      {playing ? <iframe src={`${youtubeEmbedSrc(id)}&autoplay=1`} title={label ?? "YouTube video"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full border-0" /> :
        <button type="button" aria-label={`Phát ${label ?? "video"}`} onClick={() => setPlaying(true)} className="absolute inset-0 grid w-full place-items-center text-white">
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <span className="relative rounded-full bg-black/70 px-6 py-4 text-2xl" aria-hidden="true">▶</span>
        </button>}
    </div>
    {label && <figcaption className="mt-2 text-center text-xs text-muted-foreground">{label}</figcaption>}
  </figure>;
}

interface HastText {
  type: "text";
  value: string;
}
interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}
type HastNode = HastText | HastElement | { type: string };

function textOf(node: HastNode): string {
  if (node.type === "text") return (node as HastText).value;
  if (node.type === "element") {
    return ((node as HastElement).children ?? []).map((child) => textOf(child)).join("");
  }
  return "";
}

function soleYouTubeLink(node: unknown): { id: string; label: string | null } | null {
  const children = ((node as HastElement | undefined)?.children ?? []).filter(
    (c) => !(c.type === "text" && (c as HastText).value.trim() === ""),
  );
  if (children.length !== 1) return null;
  const only = children[0];
  if (only.type !== "element" || (only as HastElement).tagName !== "a") return null;
  const href = (only as HastElement).properties?.href;
  const id = typeof href === "string" ? parseYouTubeId(href) : null;
  if (!id) return null;
  const label = textOf(only).trim();
  return { id, label: label && label !== href ? label : null };
}

const components: Components = {
  p({ node, children }) {
    const video = soleYouTubeLink(node);
    if (video) {
      return <ArticleVideo id={video.id} label={video.label} />;
    }
    return <p>{children}</p>;
  },
  a({ href, children, className }) {
    if (href?.startsWith("#")) return <a href={href} className={className}>{children}</a>;
    // "/vi/thg-express" is a website path; on the CMS origin it would 404.
    const target = href?.startsWith("/") && !href.startsWith("//") ? `${SITE}${href}` : href;
    return (
      <a href={target} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />;
  },
  table({ children }) {
    return <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-border" role="region" aria-label="Bảng nội dung" tabIndex={0}><table>{children}</table></div>;
  },
};

/** No typography plugin in the CMS build, so the article look is spelled out here. */
const ARTICLE =
  "text-sm leading-relaxed text-foreground " +
  "[&>*:first-child]:mt-0 [&_p]:my-3 " +
  "[&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold " +
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 " +
  "[&_nav_ol]:list-none [&_nav_ol]:pl-0 [&_nav_ol_ol]:pl-5 " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold " +
  "[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground " +
  "[&_img]:my-4 [&_img]:rounded-xl [&_img]:shadow-sm " +
  "[&_hr]:my-6 [&_hr]:border-border " +
  "[&_table]:my-4 [&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs";

export function MarkdownPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="text-sm italic text-muted-foreground">Chưa có nội dung để xem trước.</p>;
  }
  return (
    <div className={ARTICLE}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[articleOutline, { label: "Nội dung chính" }]]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
