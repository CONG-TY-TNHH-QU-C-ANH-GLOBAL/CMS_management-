// Deterministic normalization of an uploaded index.html — code, not AI, and
// always applied (also when the AI step is skipped or rejected).
//
//   1. One <script> for the shared /_thg/thg-lead.js, placed first in <head>
//      so its capture-phase click handler runs before the page's own scripts.
//      It turns [data-consult] elements and mailto: links into the TH Group
//      consult form that posts to the CMS leads endpoint.
//   2. thgfulfill.com links written as http:// or protocol-relative become
//      https://.
//
// Re-running it on its own output is a no-op (idempotent), which the AI step
// and the tests rely on.

import { attrValue, parseAttrs, scanTags } from "./landing.html";

export const LEAD_SCRIPT_PATH = "/_thg/thg-lead.js";

export type LandingLang = "vi" | "en" | "zh";

export function detectLang(html: string): LandingLang {
  const tag = scanTags(html).find((t) => t.kind === "start" && t.name === "html");
  const lang = tag ? (attrValue(parseAttrs(html, tag), "lang") ?? "") : "";
  const code = lang.toLowerCase().slice(0, 2);
  return code === "en" || code === "zh" ? code : "vi";
}

/** The tag a previous run injected, with the whitespace injection put before it. */
const EXISTING_LEAD_SCRIPT = /\s*<script\b[^>]*\bdata-thg-lead\b[^>]*>\s*<\/script>/gi;

export function leadScriptTag(slug: string, lang: LandingLang): string {
  return `<script src="${LEAD_SCRIPT_PATH}" data-thg-lead data-slug="${slug}" data-lang="${lang}"></script>`;
}

/** Offset right after <meta charset> (kept in the first bytes), else after <head>, else after
 *  <html>, else 0. */
function scriptInsertionPoint(html: string): number {
  const tags = scanTags(html);
  const head = tags.findIndex((t) => t.kind === "start" && t.name === "head");
  if (head >= 0) {
    const headEnd = tags.findIndex((t, i) => i > head && t.name === "head" && t.kind === "end");
    const charset = tags.find(
      (t, i) =>
        i > head &&
        (headEnd < 0 || i < headEnd) &&
        t.kind === "start" &&
        t.name === "meta" &&
        attrValue(parseAttrs(html, t), "charset") !== null,
    );
    return (charset ?? tags[head]).end;
  }
  const root = tags.find((t) => t.kind === "start" && t.name === "html");
  return root ? root.end : 0;
}

export function injectLeadScript(html: string, slug: string, lang: LandingLang): string {
  const cleaned = html.replace(EXISTING_LEAD_SCRIPT, "");
  const at = scriptInsertionPoint(cleaned);
  return `${cleaned.slice(0, at)}\n${leadScriptTag(slug, lang)}${cleaned.slice(at)}`;
}

/** `http://thgfulfill.com`, `//www.thgfulfill.com` → https. Only where a URL starts (after a
 *  quote, "(" or "="), so text that merely mentions the domain is left alone. */
const INSECURE_THG = /(["'(=]\s*)(?:http:)?\/\/((?:www\.)?thgfulfill\.com)(?=[/"'?#)\s]|$)/gi;

export function secureThgLinks(html: string): { html: string; count: number } {
  let count = 0;
  const out = html.replace(INSECURE_THG, (_whole, lead: string, host: string) => {
    count++;
    return `${lead}https://${host.toLowerCase()}`;
  });
  return { html: out, count };
}

export interface NormalizeResult {
  html: string;
  lang: LandingLang;
  notes: string[];
}

export function normalizeLandingHtml(html: string, slug: string): NormalizeResult {
  const lang = detectLang(html);
  const notes: string[] = [];
  const secured = secureThgLinks(html);
  if (secured.count > 0) {
    notes.push(`Chuyển ${secured.count} link thgfulfill.com sang https.`);
  }
  const withScript = injectLeadScript(secured.html, slug, lang);
  notes.push("Gắn thg-lead.js: nút [data-consult] và link mailto: mở form tư vấn TH Group.");
  return { html: withScript, lang, notes };
}
