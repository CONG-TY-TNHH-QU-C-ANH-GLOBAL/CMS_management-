/**
 * Sync shipping-route POLICY content from the master Google Sheet into D1.
 *
 * The /shipping-policy page on landing fetches shipping_routes from the CMS.
 * The authoritative policy text lives in the THG master sheet (English),
 * one "Policy ..." tab per route. This script pulls those tabs, converts the
 * prose into markdown, and writes it into shipping_routes.body_md so the CMS
 * (and therefore landing) reflects the sheet.
 *
 * Reusable: re-run whenever the sheet changes. Output is idempotent SQL
 * (UPDATE + DELETE), written to scripts/.tmp-sync-shipping-policy.sql.
 *
 * Usage:
 *   node scripts/sync-shipping-policy.mjs            # fetch + write .sql
 *   bun run db:console:prod --file=...               # NO — use --file form:
 *   bunx wrangler d1 execute thg-cms --remote --file=scripts/.tmp-sync-shipping-policy.sql
 *   bunx wrangler d1 execute thg-cms --local  --file=scripts/.tmp-sync-shipping-policy.sql
 *
 * Locale strategy (per operator decision): English is the master.
 *   - English markdown → the EN row (shipping_routes.locale='en'.body_md), so
 *     the EN tab shows English — the correct place for it.
 *   - If OPENAI_API_KEY is set, the script translates EN→Vietnamese and
 *     EN→Chinese and writes them to the VI and ZH rows respectively, so each
 *     locale tab holds its own language. Without the key it clears VI/ZH
 *     (leaving them empty rather than wrongly showing English).
 *   - Shipping uses the legacy 3-row-per-locale model directly (one content
 *     body per locale row). We DELETE the backfilled shipping_route_translations
 *     so the public reader's fallback serves these locale rows cleanly, and the
 *     admin EN/ZH tabs (which read via getShippingRouteForPublic → legacy
 *     fallback) show the right content. The VI→EN/ZH AI-translate pipeline is
 *     not used for shipping — the sheet is the master for all three.
 *
 * Stale-table cleanup: migration 0028 seeded shipping_route_tables from the
 * OLD hardcoded VN components. The sheet policy is prose, not those tables,
 * so we DELETE the 0028 tables for these routes to avoid showing stale data
 * alongside the fresh body_md.
 */

const SPREADSHEET_ID = "1woNrfCqybDs0zYKbGnilchhXE6JaWLAsOJxN-pQO0e4";
const OUT_REL = "scripts/.tmp-sync-shipping-policy.sql";

// gsheet "Policy ..." tab GID  →  CMS shipping_routes.slug + canonical titles.
//
// Titles are NOT in the sheet (the policy tabs are pure content), and the
// bootstrap-seeded titles were inconsistent across locales — some said "USA"
// when the route actually ships Worldwide, and the priority routes drifted on
// the Germany/EU scope. We pin them here (per operator decision) so every
// re-sync writes a consistent set across en/vi/zh.
//
// Scope note: the slugs say "us" for historical reasons, but standard /
// cosmetics / batteries are Worldwide routes (the policy lists UK, EU, JP, AU,
// etc.). Slugs are kept as-is (landing references them); only the display
// titles are corrected. Priority routes keep their specific destinations.
const ROUTE_TABS = [
  {
    slug: "vn-us-regular", gid: "1366777313", sheet: "Policy VNTHZXR VN standard WW",
    titles: {
      en: "Vietnam → Worldwide · Standard",
      vi: "Việt Nam → Toàn Cầu · Hàng thường",
      zh: "越南 → 全球 · 标准",
    },
  },
  {
    slug: "vn-us-cosmetics", gid: "1764855107", sheet: "Policy VNMUZXR standard VN WW (cosmetics)",
    titles: {
      en: "Vietnam → Worldwide · Cosmetics",
      vi: "Việt Nam → Toàn Cầu · Mỹ phẩm",
      zh: "越南 → 全球 · 化妆品",
    },
  },
  {
    slug: "cn-us-regular", gid: "535541764", sheet: "Policy THPHR (Standard CN regular)",
    titles: {
      en: "China → Worldwide · Standard",
      vi: "Trung Quốc → Toàn Cầu · Hàng thường",
      zh: "中国 → 全球 · 标准",
    },
  },
  {
    slug: "cn-us-cosmetics", gid: "1814177658", sheet: "Policy MUZXR (Stand CN WW cosmetics)",
    titles: {
      en: "China → Worldwide · Cosmetics",
      vi: "Trung Quốc → Toàn Cầu · Mỹ phẩm",
      zh: "中国 → 全球 · 化妆品",
    },
  },
  {
    slug: "cn-us-batteries", gid: "1808506806", sheet: "Policy THZXR (Stand CN WW batteries)",
    titles: {
      en: "China → Worldwide · Batteries",
      vi: "Trung Quốc → Toàn Cầu · Pin điện",
      zh: "中国 → 全球 · 电池",
    },
  },
  {
    slug: "vn-us-priority", gid: "1437367264", sheet: "Policy VN-YTYCPREC VN priority",
    titles: {
      en: "Vietnam → USA & Germany · Priority",
      vi: "Việt Nam → Mỹ & Đức · Priority",
      zh: "越南 → 美国 & 德国 · Priority",
    },
  },
  {
    slug: "cn-us-priority", gid: "1663964711", sheet: "Policy YTYCPREC priority CN US",
    titles: {
      en: "China → USA/UK/Germany/France/Spain · Priority",
      vi: "Trung Quốc → Mỹ/Anh/Đức/Pháp/Tây Ban Nha · Priority",
      zh: "中国 → 美国/英国/德国/法国/西班牙 · Priority",
    },
  },
];

// ── CSV parser (RFC-4180-ish, handles quoted multiline cells) ──────────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ── Prose → markdown ───────────────────────────────────────────────────────
// The policy tabs are free-form: column A carries paragraphs, often with
// section markers (Ⅰ-, II-, "1. UK:", roman numerals). Trailing columns are
// mostly padding ("","",...) but occasionally hold a label (e.g. "EU VAT rate").
// Heuristic conversion:
//   - Join the non-empty cells of a row with " — " (rare, but preserves a
//     trailing label/link sitting in column C/D).
//   - A line that looks like a top-level section header (roman numeral or an
//     ALL-CAPS-ish short title) becomes a `## ` heading.
//   - A line starting with a number/letter enumerator ("1.", "(1)", "a)")
//     becomes a markdown list item.
//   - Bare URLs are wrapped as markdown links.
//   - Everything else becomes a paragraph.
function rowsToMarkdown(rows) {
  const ROMAN = /^\s*(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ|[IVX]{1,4})\s*[-.–)、，．:：]/;
  const ENUM = /^\s*(\(?\d{1,2}[).–]|\(?[a-z][).]|[①②③④⑤⑥⑦⑧⑨⑩])/;
  const URL = /^https?:\/\/\S+$/i;
  const out = [];
  for (const r of rows) {
    const cells = r.map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length === 0) { out.push(""); continue; }
    let line = cells.join(" — ");
    line = line.replace(/\s+/g, " ").trim();
    if (!line) { out.push(""); continue; }

    if (URL.test(line)) { out.push(`[${line}](${line})`); continue; }
    if (ROMAN.test(line)) { out.push(`\n## ${line.replace(/^\s*/, "")}`); continue; }
    // Short, header-ish line (no terminal punctuation, < 60 chars, ends with ":" or all-caps-ish)
    if (line.length < 60 && /[:：]$/.test(line)) { out.push(`\n### ${line.replace(/[:：]$/, "")}`); continue; }
    if (ENUM.test(line)) { out.push(`- ${line.replace(ENUM, (m) => m.trim()).trim()}`); continue; }
    out.push(line);
  }
  // collapse 3+ blank lines to max 1
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

async function fetchTab(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&_t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for gid=${gid}`);
  return res.text();
}

// ── OpenAI translation (optional — only if OPENAI_API_KEY is present) ──────
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

// Cap per chunk so even verbose Vietnamese output stays under the
// per-call timeout. Mirrors the in-Worker translate.
const MAX_CHUNK_CHARS = 2500;
const TRANSLATE_CONCURRENCY = 8;

// Break ONE oversized line into ≤cap pieces. rowsToMarkdown collapses each
// cell's internal whitespace (incl. newlines) into single spaces, so a
// multi-paragraph cell becomes a single line many KB long with no `\n` to
// split on — the prior line-only splitter left it whole, producing a chunk
// that overran the 90s OpenAI timeout (the "operation was aborted" failures
// on the big CN routes). We break at the last sentence boundary within the
// cap, else the last space, else a hard cut.
function hardSplitLine(line, cap) {
  const out = [];
  let rest = line;
  const SENT = /[.!?。！？;；](\s|$)/g;
  while (rest.length > cap) {
    const window = rest.slice(0, cap);
    let cut = -1;
    SENT.lastIndex = 0;
    let m;
    while ((m = SENT.exec(window)) !== null) cut = m.index + 1; // just past the punctuation
    if (cut < cap * 0.5) {
      const sp = window.lastIndexOf(" ");
      cut = sp >= cap * 0.5 ? sp + 1 : cap;
    }
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

// Split markdown into translate-sized chunks: first at `## ` boundaries, then
// pack lines into ≤MAX_CHUNK_CHARS chunks, hard-splitting any single line that
// is itself over the cap so NO chunk can exceed it (regardless of input).
function splitForTranslate(md) {
  const sections = [];
  let cur = [];
  for (const line of md.split("\n")) {
    if (/^##\s+/.test(line) && cur.length > 0) {
      sections.push(cur.join("\n"));
      cur = [line];
    } else cur.push(line);
  }
  if (cur.length > 0) sections.push(cur.join("\n"));

  const chunks = [];
  for (const section of sections) {
    if (section.length <= MAX_CHUNK_CHARS) {
      if (section.trim()) chunks.push(section);
      continue;
    }
    let buf = []; let len = 0;
    const flush = () => {
      if (buf.join("").trim()) chunks.push(buf.join("\n"));
      buf = []; len = 0;
    };
    for (const line of section.split("\n")) {
      if (line.length > MAX_CHUNK_CHARS) {
        flush();
        for (const piece of hardSplitLine(line, MAX_CHUNK_CHARS)) chunks.push(piece);
        continue;
      }
      if (len + line.length + 1 > MAX_CHUNK_CHARS && buf.length > 0) flush();
      buf.push(line);
      len += line.length + 1;
    }
    flush();
  }
  return chunks.filter((c) => c.trim().length > 0);
}

// Bounded-concurrency map preserving result order.
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function translateChunkOnce(md, targetLang) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You localize cross-border shipping policy for THG Fulfill. Translate the ` +
              `user's markdown from English to ${targetLang}. STRICT RULES:\n` +
              `- Preserve ALL markdown structure exactly: ## headings, ### subheadings, ` +
              `- bullets, [text](url) links, blank lines.\n` +
              `- Keep verbatim (do NOT translate): numbers, prices, currency codes/symbols ` +
              `($ € £ NOK CHF RMB ₫), country codes (US, EU, UK...), dates, URLs, weights/` +
              `dimensions, and proper nouns/acronyms (THG, Yunexpress, IOSS, USPS, DHL, Evri, ` +
              `VAT, GST, CE, APO/FPO, SKU, HS, VOEC).\n` +
              `- Translate naturally and professionally for a seller audience.\n` +
              `- Output ONLY the translated markdown — no preamble, no code fences.`,
          },
          { role: "user", content: md },
        ],
      }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const e = new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }
    const json = await res.json();
    const out = json?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error("OpenAI returned empty content");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function translateChunkWithRetry(md, targetLang, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await translateChunkOnce(md, targetLang);
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const retryable = status === 429 || status === 502 || status === 503 || err?.name === "AbortError";
      if (!retryable || i === attempts - 1) break;
      const delay = 1200 * Math.pow(2, i) + Math.floor(Math.random() * 600);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function translateMarkdown(md, targetLang, label) {
  const chunks = splitForTranslate(md);
  if (chunks.length <= 1) {
    const t0 = Date.now();
    const out = await translateChunkWithRetry(md, targetLang);
    process.stderr.write(`[sync]     ${label}: 1 chunk · ${Date.now() - t0}ms\n`);
    return out;
  }
  process.stderr.write(`[sync]     ${label}: ${chunks.length} chunks @ concurrency ${TRANSLATE_CONCURRENCY}…\n`);
  const t0 = Date.now();
  let done = 0;
  const translated = await mapPool(chunks, TRANSLATE_CONCURRENCY, async (c, i) => {
    const tc = Date.now();
    const r = await translateChunkWithRetry(c, targetLang);
    done++;
    process.stderr.write(`[sync]       ${label} chunk ${i + 1}/${chunks.length} done in ${Date.now() - tc}ms (${done}/${chunks.length} complete)\n`);
    return r;
  });
  process.stderr.write(`[sync]     ${label}: total ${Date.now() - t0}ms\n`);
  return translated.join("\n\n");
}

async function main() {
  const canTranslate = OPENAI_KEY.length > 0;
  process.stderr.write(
    canTranslate
      ? "[sync] OPENAI_API_KEY present → will translate EN→VI and EN→ZH\n"
      : "[sync] no OPENAI_API_KEY → English only; VI/ZH will be cleared (run again with key to translate)\n",
  );

  // SYNC_ROUTES env var: comma-separated slug allowlist. Lets the workflow
  // re-run just the routes that failed last time (incremental persistence
  // already saves completed routes' SQL — this lets a follow-up run skip
  // re-doing them too).
  const filter = (process.env.SYNC_ROUTES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const targets = filter.length > 0
    ? ROUTE_TABS.filter((t) => filter.includes(t.slug))
    : ROUTE_TABS;
  if (filter.length > 0) {
    process.stderr.write(`[sync] SYNC_ROUTES filter: ${filter.join(", ")} → ${targets.length} of ${ROUTE_TABS.length} routes\n`);
    const missing = filter.filter((f) => !ROUTE_TABS.some((t) => t.slug === f));
    if (missing.length > 0) {
      process.stderr.write(`[sync] WARNING: unknown slugs in SYNC_ROUTES (ignored): ${missing.join(", ")}\n`);
    }
  }
  if (targets.length === 0) {
    process.stderr.write(`[sync] no routes selected — nothing to do\n`);
    return;
  }

  // Stream SQL to disk as each route completes. If the script crashes mid-run
  // (e.g. an OpenAI timeout on route 3), the workflow's "Apply to remote D1"
  // step (now run with `if: always()`) still picks up the SQL for routes 1+2.
  // Re-run with SYNC_ROUTES=route3,... to finish the rest.
  const { openSync, writeSync, closeSync, fsyncSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const outPath = resolve(process.cwd(), OUT_REL);
  // Mode 'w' truncates any prior file so stale routes from an earlier run
  // can't bleed into this one.
  const fd = openSync(outPath, "w");
  function append(line) {
    writeSync(fd, line + "\n");
  }
  function flush() {
    try { fsyncSync(fd); } catch { /* fsync best-effort */ }
  }

  append("-- Generated by scripts/sync-shipping-policy.mjs — DO NOT edit by hand.");
  append("-- Re-run the script to regenerate from the master Google Sheet.");
  if (filter.length > 0) append(`-- SYNC_ROUTES filter active: ${filter.join(", ")}`);
  append("");
  flush();

  const ok = [];
  const failed = [];

  for (const tab of targets) {
    const tRoute = Date.now();
    process.stderr.write(`[sync] ── ${tab.slug} (gid ${tab.gid}) ──\n`);
    try {
      const csv = await fetchTab(tab.gid);
      const rows = parseCSV(csv);
      const enMd = rowsToMarkdown(rows);
      if (enMd.length < 20) {
        process.stderr.write(`[sync]   WARNING: ${tab.slug} produced only ${enMd.length} chars — skipping\n`);
        failed.push({ slug: tab.slug, reason: `only ${enMd.length} chars` });
        continue;
      }
      process.stderr.write(`[sync]   ${tab.slug}: ${enMd.length} chars EN\n`);

      let viMd = "";
      let zhMd = "";
      if (canTranslate) {
        viMd = await translateMarkdown(enMd, "Vietnamese", "VI");
        zhMd = await translateMarkdown(enMd, "Chinese (Simplified)", "ZH");
        process.stderr.write(`[sync]   ${tab.slug}: EN ${enMd.length} · VI ${viMd.length} · ZH ${zhMd.length}\n`);
      }

      append(`-- ${tab.slug}  ← sheet "${tab.sheet}" (gid ${tab.gid})`);
      // Each locale's content + canonical title goes into its own locale row
      // (legacy 3-row model). Title is pinned here (not from the sheet) so the
      // three locales stay consistent on every re-sync.
      append(
        `UPDATE shipping_routes SET title = '${sqlEscape(tab.titles.en)}', ` +
          `body_md = '${sqlEscape(enMd)}', notes_json = NULL ` +
          `WHERE slug = '${tab.slug}' AND locale = 'en';`,
      );
      append(
        `UPDATE shipping_routes SET title = '${sqlEscape(tab.titles.vi)}', ` +
          `body_md = '${sqlEscape(viMd)}', notes_json = NULL ` +
          `WHERE slug = '${tab.slug}' AND locale = 'vi';`,
      );
      append(
        `UPDATE shipping_routes SET title = '${sqlEscape(tab.titles.zh)}', ` +
          `body_md = '${sqlEscape(zhMd)}', notes_json = NULL ` +
          `WHERE slug = '${tab.slug}' AND locale = 'zh';`,
      );
      // Drop stale 0028 tables (sheet policy is prose, not tables).
      append(
        `DELETE FROM shipping_route_tables WHERE route_id IN ` +
          `(SELECT id FROM shipping_routes WHERE slug = '${tab.slug}');`,
      );
      // Drop backfilled translation rows so the public reader + admin EN/ZH tabs
      // fall back cleanly to these per-locale rows (no stale/empty translation
      // shadowing the fresh content).
      append(
        `DELETE FROM shipping_route_translations WHERE shipping_route_id IN ` +
          `(SELECT id FROM shipping_routes WHERE slug = '${tab.slug}');`,
      );
      append("");
      flush();
      ok.push({ slug: tab.slug, ms: Date.now() - tRoute });
      process.stderr.write(`[sync]   ✓ ${tab.slug} persisted in ${Date.now() - tRoute}ms\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[sync]   ✗ ${tab.slug} FAILED after ${Date.now() - tRoute}ms: ${msg}\n`);
      append(`-- ✗ ${tab.slug} FAILED: ${msg.slice(0, 200).replace(/\n/g, " ")}`);
      append("");
      flush();
      failed.push({ slug: tab.slug, reason: msg });
      // Keep going — partial progress is better than total failure.
    }
  }

  closeSync(fd);

  process.stderr.write(`\n[sync] === summary ===\n`);
  process.stderr.write(`[sync] OK     (${ok.length}): ${ok.map((r) => r.slug).join(", ") || "—"}\n`);
  process.stderr.write(`[sync] FAILED (${failed.length}): ${failed.map((r) => r.slug).join(", ") || "—"}\n`);
  process.stderr.write(`[sync] wrote ${outPath}\n`);
  process.stderr.write(`[sync] apply with: bunx wrangler d1 execute thg-cms --remote --file=${OUT_REL}\n`);

  if (failed.length > 0) {
    process.stderr.write(`[sync] re-run failed routes: SYNC_ROUTES="${failed.map((r) => r.slug).join(",")}" node scripts/sync-shipping-policy.mjs\n`);
    // Exit non-zero so CI surfaces the partial failure, but the SQL file is
    // already flushed for the workflow's apply step (gated on `if: always()`).
    process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`[sync] FAILED: ${err.message}\n`);
  process.exit(1);
});
