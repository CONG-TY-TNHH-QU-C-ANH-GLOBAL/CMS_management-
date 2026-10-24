// Deterministic audit checks — everything that can be decided by code runs
// here, on the final (normalized) index.html plus the bundle's file list. The
// AI audit only covers what needs reading comprehension. These run even when
// the AI is unavailable, so IT always gets a report.

import { attrValue, parseAttrs, scanTags, visibleText, type HtmlTag } from "./landing.html";
import type { FindingCategory, FindingSeverity, LandingFinding } from "./landing.types";

export interface CheckInput {
  html: string;
  /** Every path in the bundle (normalized, relative). */
  paths: ReadonlySet<string>;
  /** Text of the bundle's CSS files, for url() references. */
  stylesheets?: ReadonlyMap<string, string>;
}

const finding = (
  severity: FindingSeverity,
  category: FindingCategory,
  message: string,
  evidence: string,
): LandingFinding => ({ severity, category, message, evidence, source: "rule" });

/** "a, b, c (+4 nữa)" — evidence stays readable in Telegram and the editor. */
function listEvidence(items: readonly string[], max = 10): string {
  const unique = [...new Set(items)];
  const shown = unique.slice(0, max).join(", ");
  return unique.length > max ? `${shown} (+${unique.length - max} nữa)` : shown;
}

interface ScriptBlock {
  body: string;
}

function inlineScripts(html: string, tags: HtmlTag[]): ScriptBlock[] {
  const out: ScriptBlock[] = [];
  tags.forEach((tag, i) => {
    if (tag.kind !== "start" || tag.name !== "script") return;
    const close = tags[i + 1];
    if (close?.kind === "end" && close.name === "script") {
      out.push({ body: html.slice(tag.end, close.start) });
    }
  });
  return out;
}

function styleBodies(html: string, tags: HtmlTag[]): string[] {
  const out: string[] = [];
  tags.forEach((tag, i) => {
    if (tag.kind !== "start" || tag.name !== "style") return;
    const close = tags[i + 1];
    if (close?.kind === "end") out.push(html.slice(tag.end, close.start));
  });
  return out;
}

// ── Asset references ────────────────────────────────────────────────────────

const NON_FILE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{|\$)/i;
const ASSET_EXT = /\.(?:jpe?g|png|webp|gif|svg|avif|mp4|webm|css|js|json|woff2?|ttf|otf)$/i;

/** Resolve `ref` against the directory of `from`; null for anything that is not a local file. */
export function resolveLocal(ref: string, from = "index.html"): string | null {
  const clean = ref.trim().split(/[?#]/)[0];
  if (!clean || NON_FILE_URL.test(clean) || clean.startsWith("/")) return null;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/")).split("/") : [];
  const parts = [...base];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  for (const seg of decoded.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

const URL_ATTRS: Record<string, string[]> = {
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  video: ["src", "poster"],
  audio: ["src"],
  script: ["src"],
  link: ["href"],
  iframe: ["src"],
  input: ["src"],
};

function srcsetUrls(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function cssUrls(css: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push(m[2]);
  return out;
}

function stringLiterals(js: string): string[] {
  const out: string[] = [];
  const re = /(["'])((?:(?!\1)[^\\\n]){1,200})\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) out.push(m[2]);
  return out;
}

function checkAssets(input: CheckInput, tags: HtmlTag[], scripts: ScriptBlock[]): LandingFinding[] {
  const { html, paths } = input;
  const missing: string[] = [];
  const check = (ref: string, from = "index.html") => {
    const local = resolveLocal(ref, from);
    if (local && !paths.has(local)) missing.push(local);
  };

  for (const tag of tags) {
    if (tag.kind !== "start") continue;
    const attrs = parseAttrs(html, tag);
    for (const name of URL_ATTRS[tag.name] ?? []) {
      const value = attrValue(attrs, name);
      if (!value) continue;
      for (const url of name === "srcset" ? srcsetUrls(value) : [value]) check(url);
    }
    const style = attrValue(attrs, "style");
    if (style) cssUrls(style).forEach((u) => check(u));
  }
  styleBodies(html, tags).forEach((css) => cssUrls(css).forEach((u) => check(u)));
  for (const [path, css] of input.stylesheets ?? []) cssUrls(css).forEach((u) => check(u, path));

  // Script literals: full file names ("assets/x.jpg", or a bare "x.jpg" that a template prefixes)
  // and directory prefixes ("assets/products/") that templates concatenate with a name.
  const all = [...paths];
  const missingDirs: string[] = [];
  for (const literal of scripts.flatMap((s) => stringLiterals(s.body))) {
    if (/\s/.test(literal) || NON_FILE_URL.test(literal) || literal.startsWith("/")) continue;
    if (ASSET_EXT.test(literal)) {
      const local = resolveLocal(literal);
      if (!local) continue;
      const found = paths.has(local) || all.some((p) => p.endsWith(`/${local}`));
      if (!found) missing.push(local);
    } else if (/^[\w.-]+(?:\/[\w.-]+)*\/$/.test(literal) && literal.includes("/")) {
      const dir = resolveLocal(literal);
      if (dir && !all.some((p) => p.startsWith(`${dir}/`))) missingDirs.push(`${dir}/`);
    }
  }

  const out: LandingFinding[] = [];
  if (missingDirs.length > 0) {
    out.push(
      finding(
        "critical",
        "asset",
        "Script trên trang dùng ảnh trong thư mục không có trong ZIP — ảnh sẽ không hiện.",
        listEvidence(missingDirs),
      ),
    );
  }
  if (missing.length > 0) {
    const unique = new Set(missing);
    out.push(
      finding(
        "critical",
        "asset",
        `Thiếu ${unique.size} tệp mà trang tham chiếu (ảnh, CSS, JS…) — trang sẽ hiển thị lỗi.`,
        listEvidence(missing),
      ),
    );
  }
  return out;
}

// ── Links ───────────────────────────────────────────────────────────────────

const RESOURCE_TAGS = new Set(["img", "script", "link", "iframe", "source", "video", "audio"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A host that imitates the brand domain without being it (thgfulfill.vn, thgfulfil.com…). */
export function isLookalikeHost(host: string): boolean {
  if (host === "thgfulfill.com" || host.endsWith(".thgfulfill.com")) return false;
  return /thg-?fulfil|thgfullfil|th-?group-?fulfil/.test(host);
}

function checkLinks(html: string, tags: HtmlTag[]): LandingFinding[] {
  const httpResources: string[] = [];
  const httpLinks: string[] = [];
  const rootRelative: string[] = [];
  const lookalike: string[] = [];
  const externalForms: string[] = [];
  for (const tag of tags) {
    if (tag.kind !== "start") continue;
    const attrs = parseAttrs(html, tag);
    for (const name of ["href", "src", "action", "poster"]) {
      const value = attrValue(attrs, name)?.trim();
      if (!value) continue;
      if (/^http:\/\//i.test(value)) {
        (RESOURCE_TAGS.has(tag.name) ? httpResources : httpLinks).push(value);
      }
      const host = /^https?:\/\//i.test(value) ? hostOf(value) : null;
      if (host && isLookalikeHost(host)) lookalike.push(value);
      if (
        tag.name === "a" &&
        name === "href" &&
        /^\/(?!\/)/.test(value) &&
        !value.startsWith("/_thg/")
      ) {
        rootRelative.push(value);
      }
      if (tag.name === "form" && name === "action" && host && !host.endsWith("thgfulfill.com")) {
        externalForms.push(value);
      }
    }
  }
  const out: LandingFinding[] = [];
  if (httpResources.length > 0) {
    out.push(
      finding(
        "major",
        "link",
        "Tài nguyên tải qua http:// sẽ bị trình duyệt chặn trên trang https.",
        listEvidence(httpResources),
      ),
    );
  }
  if (httpLinks.length > 0) {
    out.push(
      finding("minor", "link", "Link dùng http:// thay vì https://.", listEvidence(httpLinks)),
    );
  }
  if (rootRelative.length > 0) {
    out.push(
      finding(
        "major",
        "link",
        "Link bắt đầu bằng / sẽ trỏ về lp.thgfulfill.com (404) — cần link đầy đủ https://thgfulfill.com/…",
        listEvidence(rootRelative),
      ),
    );
  }
  if (lookalike.length > 0) {
    out.push(
      finding(
        "major",
        "link",
        "Link tới tên miền giống thgfulfill.com nhưng sai.",
        listEvidence(lookalike),
      ),
    );
  }
  if (externalForms.length > 0) {
    out.push(
      finding(
        "major",
        "form",
        "Form gửi dữ liệu ra tên miền bên ngoài.",
        listEvidence(externalForms),
      ),
    );
  }
  return out;
}

// ── Brand, mailto, placeholder, alt, countdown ──────────────────────────────

const OLD_BRAND = /THG[\s ]+Fulfill(?![\w-])/gi;

/** Contexts of the old company name that are not part of a URL or e-mail address. */
export function oldBrandContexts(html: string): string[] {
  const out: string[] = [];
  OLD_BRAND.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OLD_BRAND.exec(html))) {
    const before = html[m.index - 1] ?? "";
    if (/[/.@\w]/.test(before)) continue;
    out.push(
      html.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, " "),
    );
  }
  return out;
}

function checkBrand(html: string): LandingFinding[] {
  const contexts = oldBrandContexts(html);
  if (contexts.length === 0) return [];
  return [
    finding(
      "major",
      "brand",
      `Còn ${contexts.length} chỗ dùng tên cũ "THG Fulfill" — tên công ty là "TH Group" (dịch vụ: "TH Group Fulfill").`,
      listEvidence(contexts, 3),
    ),
  ];
}

function checkMailto(html: string): LandingFinding[] {
  const hits = html.match(/mailto:[^"'\s<>)]*/gi) ?? [];
  if (hits.length === 0) return [];
  return [
    finding(
      "major",
      "form",
      "Trang gửi form/nút tư vấn qua email (mailto:). thg-lead.js đã chuyển các nút này sang form TH Group, nhưng IT nên gỡ code mailto khỏi trang.",
      listEvidence(
        hits.map((h) => h.split("?")[0]),
        5,
      ),
    ),
  ];
}

const PLACEHOLDER =
  /lorem ipsum|dolor sit amet|\bTODO\b|\bFIXME\b|\bTBD\b|your (?:company|brand) name|\[(?:tên|name|giá|price|link)[^\]]{0,30}\]|\bxxx+\b/gi;

function checkPlaceholders(html: string): LandingFinding[] {
  const text = visibleText(html);
  const hits = text.match(PLACEHOLDER) ?? [];
  if (hits.length === 0) return [];
  return [
    finding("major", "placeholder", "Trang còn chữ mẫu / placeholder.", listEvidence(hits, 5)),
  ];
}

function checkAlt(html: string, tags: HtmlTag[], scripts: ScriptBlock[]): LandingFinding[] {
  const missing: string[] = [];
  for (const tag of tags) {
    if (tag.kind !== "start" || tag.name !== "img") continue;
    const attrs = parseAttrs(html, tag);
    if (attrValue(attrs, "alt") === null) missing.push(attrValue(attrs, "src") ?? "(không có src)");
  }
  for (const s of scripts) {
    for (const m of s.body.match(/<img\b[^>]*>/gi) ?? []) {
      if (!/\balt\s*=/i.test(m)) missing.push("(ảnh tạo bằng script)");
    }
  }
  if (missing.length === 0) return [];
  return [
    finding(
      "minor",
      "accessibility",
      `${missing.length} ảnh thiếu thuộc tính alt.`,
      listEvidence(missing, 5),
    ),
  ];
}

const NEXT_YEAR = /(?:getFullYear\(\)\s*\+\s*1\b|new Date\(\s*[\w.]+\s*\+\s*1\s*,)/;

function checkCountdown(scripts: ScriptBlock[]): LandingFinding[] {
  for (const s of scripts) {
    if (!/getFullYear\s*\(/.test(s.body)) continue;
    const m = NEXT_YEAR.exec(s.body);
    if (!m) continue;
    const line = s.body
      .slice(s.body.lastIndexOf("\n", m.index) + 1, s.body.indexOf("\n", m.index))
      .trim();
    return [
      finding(
        "minor",
        "countdown",
        "Đồng hồ đếm ngược tự chuyển sang năm sau khi qua ngày sự kiện — trang hết hạn sẽ vẫn đếm ngược thay vì báo đã kết thúc.",
        line.slice(0, 160),
      ),
    ];
  }
  return [];
}

// ── Prices copied between products ──────────────────────────────────────────

const PRICE = /(?:US)?\$\s?\d{1,5}(?:[.,]\d{1,2})?|\d{1,3}(?:[.,]\d{3})+\s?(?:đ|₫|VND)\b/gi;

interface PricedItem {
  name: string;
  signature: string;
}

/** Product-like records: JS object literals with a name, and HTML cards with a heading. */
function pricedItems(html: string, tags: HtmlTag[], scripts: ScriptBlock[]): PricedItem[] {
  const items: PricedItem[] = [];
  const add = (name: string | null, chunk: string) => {
    const prices = chunk.match(PRICE) ?? [];
    if (!name || prices.length < 2) return;
    items.push({
      name: name.trim(),
      signature: prices.map((p) => p.replace(/\s/g, "")).join(" | "),
    });
  };
  for (const s of scripts) {
    for (const obj of s.body.match(/\{[^{}]{0,2000}\}/g) ?? []) {
      const name = /\b(?:name|title)\s*:\s*(["'])(.+?)\1/.exec(obj)?.[2] ?? null;
      add(name, obj);
    }
  }
  tags.forEach((tag, i) => {
    if (tag.kind !== "start" || !["article", "li"].includes(tag.name)) return;
    const close = tags.findIndex((t, j) => j > i && t.kind === "end" && t.name === tag.name);
    if (close < 0) return;
    const chunk = html.slice(tag.end, tags[close].start);
    const heading = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(chunk)?.[1];
    add(heading ? visibleText(heading) : null, visibleText(chunk));
  });
  return items;
}

function checkCopiedPrices(
  html: string,
  tags: HtmlTag[],
  scripts: ScriptBlock[],
): LandingFinding[] {
  const bySignature = new Map<string, Set<string>>();
  for (const item of pricedItems(html, tags, scripts)) {
    const names = bySignature.get(item.signature) ?? new Set<string>();
    names.add(item.name);
    bySignature.set(item.signature, names);
  }
  const out: LandingFinding[] = [];
  for (const [signature, names] of bySignature) {
    if (names.size < 2) continue;
    out.push(
      finding(
        "major",
        "price",
        `Các sản phẩm khác nhau có bảng giá giống hệt nhau — có thể đã copy nhầm giá: ${[...names].join(", ")}.`,
        signature,
      ),
    );
  }
  return out;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function runDeterministicChecks(input: CheckInput): LandingFinding[] {
  const tags = scanTags(input.html);
  const scripts = inlineScripts(input.html, tags);
  return [
    ...checkAssets(input, tags, scripts),
    ...checkLinks(input.html, tags),
    ...checkBrand(input.html),
    ...checkMailto(input.html),
    ...checkPlaceholders(input.html),
    ...checkCopiedPrices(input.html, tags, scripts),
    ...checkAlt(input.html, tags, scripts),
    ...checkCountdown(scripts),
  ];
}
