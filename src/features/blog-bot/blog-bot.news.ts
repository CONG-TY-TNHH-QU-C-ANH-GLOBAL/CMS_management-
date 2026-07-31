// Blog Auto-Bot — recent-news context for the 'news' article type (Phase 6).
//
// Uses Google News RSS (free, no API key) to pull recent HEADLINES + source +
// link for a query. We deliberately take only titles/sources/links (what the
// feed publishes for syndication) — NOT full article bodies — and the model is
// instructed to synthesize an ORIGINAL roundup that cites each source with its
// link. This keeps the feature copyright-safe (aggregation + attribution, not
// reproduction), mirroring why we use licensed stock photos instead of scraping
// arbitrary images.
//
// Never throws — a fetch/parse failure returns an empty list + error string;
// the caller writes the article without news context and notes the warning.

export interface NewsItem {
  title: string;
  source: string;
  link: string;
  date: string;
}

const FETCH_TIMEOUT_MS = 15_000;

// hl (language), gl (country), ceid — tuned per locale for relevant results.
const LOCALE_PARAMS: Record<string, string> = {
  vi: "hl=vi&gl=VN&ceid=VN:vi",
  en: "hl=en-US&gl=US&ceid=US:en",
  zh: "hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(block: string, re: RegExp): string {
  const m = block.match(re);
  return m ? m[1] : "";
}

/** Parse Google News RSS <item> blocks into NewsItem[]. Regex-based (no XML
 *  dependency in the Workers bundle); tolerant of missing fields. */
function parseRss(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
    const rawTitle = firstMatch(block, /<title>([\s\S]*?)<\/title>/);
    const title = stripTags(rawTitle);
    if (!title) continue;
    const link = stripTags(firstMatch(block, /<link>([\s\S]*?)<\/link>/));
    const date = stripTags(firstMatch(block, /<pubDate>([\s\S]*?)<\/pubDate>/));
    // <source url="...">Publisher</source>
    const sourceName = stripTags(firstMatch(block, /<source[^>]*>([\s\S]*?)<\/source>/));
    const sourceUrl = firstMatch(block, /<source[^>]*url="([^"]*)"/);
    items.push({
      title,
      source: sourceName || "",
      link: sourceUrl || link,
      date,
    });
  }
  return items;
}

/** Fetch recent news headlines for a query via Google News RSS. Never throws. */
export async function fetchNews(
  query: string,
  locale: string,
  limit = 8,
): Promise<{ items: NewsItem[]; error: string | null }> {
  const q = query.trim();
  if (!q) return { items: [], error: "Không có từ khóa tin tức." };
  const params = LOCALE_PARAMS[locale] ?? LOCALE_PARAMS.en;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${params}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "thg-cms-blog-bot", Accept: "application/rss+xml, application/xml" },
      signal: controller.signal,
    });
    if (!res.ok) return { items: [], error: `Google News ${res.status}` };
    const xml = await res.text();
    const items = parseRss(xml, limit);
    if (items.length === 0) return { items: [], error: `Không tìm thấy tin tức cho "${q}".` };
    return { items, error: null };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Format news items as a compact context block for the generation prompt. */
export function formatNewsContext(items: NewsItem[]): string {
  return items
    .map((it, i) => `${i + 1}. "${it.title}"${it.source ? ` — ${it.source}` : ""}\n   ${it.link}`)
    .join("\n");
}
