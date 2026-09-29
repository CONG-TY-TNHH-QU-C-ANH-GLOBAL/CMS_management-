import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { parseYouTubeId, youtubeEmbedSrc } from "./youtube";

/**
 * Renders article Markdown the way thgfulfill.com does (react-markdown +
 * remark-gfm, same versions as the landing), including the one rule the
 * website adds on top: a paragraph holding nothing but a YouTube link becomes
 * a playable video. Keep `soleYouTubeLink` in step with the landing's
 * ArticleMarkdown or the preview will promise something the site won't do.
 */

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
  if (node.type === "element") return ((node as HastElement).children ?? []).map(textOf).join("");
  return "";
}

export function soleYouTubeLink(node: unknown): { id: string; label: string | null } | null {
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
      return (
        <figure className="my-6">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <iframe
              src={youtubeEmbedSrc(video.id)}
              title={video.label ?? "YouTube video"}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
          {video.label && (
            <figcaption className="mt-2 text-center text-xs text-muted-foreground">
              {video.label}
            </figcaption>
          )}
        </figure>
      );
    }
    return <p>{children}</p>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />;
  },
};

/** No typography plugin in the CMS build, so the article look is spelled out here. */
const ARTICLE =
  "text-sm leading-relaxed text-foreground " +
  "[&>*:first-child]:mt-0 [&_p]:my-3 " +
  "[&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold " +
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 " +
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
