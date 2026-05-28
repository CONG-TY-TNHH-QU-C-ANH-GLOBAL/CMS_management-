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
 *   - English markdown is written to the VI *source* row (shipping_routes
 *     .locale='vi'.body_md) so the public reader + AI-translate pipeline have
 *     a single canonical body to work from, and EVERY locale renders the
 *     correct (English) content immediately via the getShippingRouteForPublic
 *     fallback chain.
 *   - To localise: open each route in admin → Sparkles → generate EN+ZH
 *     drafts → approve. (EN comes back ~identical; ZH gets Chinese.) Real
 *     Vietnamese can be authored in the VI tab afterward, or this script can
 *     be extended with an OpenAI EN→VI pass later.
 *
 * Stale-table cleanup: migration 0028 seeded shipping_route_tables from the
 * OLD hardcoded VN components. The sheet policy is prose, not those tables,
 * so we DELETE the 0028 tables for these routes to avoid showing stale data
 * alongside the fresh body_md.
 */

const SPREADSHEET_ID = "1woNrfCqybDs0zYKbGnilchhXE6JaWLAsOJxN-pQO0e4";
const OUT_REL = "scripts/.tmp-sync-shipping-policy.sql";

// gsheet "Policy ..." tab GID  →  CMS shipping_routes.slug
const ROUTE_TABS = [
  { slug: "vn-us-regular", gid: "1366777313", sheet: "Policy VNTHZXR VN standard WW" },
  { slug: "vn-us-cosmetics", gid: "1764855107", sheet: "Policy VNMUZXR standard VN WW (cosmetics)" },
  { slug: "cn-us-regular", gid: "535541764", sheet: "Policy THPHR (Standard CN regular)" },
  { slug: "cn-us-cosmetics", gid: "1814177658", sheet: "Policy MUZXR (Stand CN WW cosmetics)" },
  { slug: "cn-us-batteries", gid: "1808506806", sheet: "Policy THZXR (Stand CN WW batteries)" },
  { slug: "vn-us-priority", gid: "1437367264", sheet: "Policy VN-YTYCPREC VN priority" },
  { slug: "cn-us-priority", gid: "1663964711", sheet: "Policy YTYCPREC priority CN US" },
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

async function main() {
  const stmts = [
    "-- Generated by scripts/sync-shipping-policy.mjs — DO NOT edit by hand.",
    "-- Re-run the script to regenerate from the master Google Sheet.",
    "",
  ];

  for (const tab of ROUTE_TABS) {
    process.stderr.write(`[sync] fetching ${tab.slug} (gid ${tab.gid})...\n`);
    const csv = await fetchTab(tab.gid);
    const rows = parseCSV(csv);
    const md = rowsToMarkdown(rows);
    if (md.length < 20) {
      process.stderr.write(`[sync] WARNING: ${tab.slug} produced only ${md.length} chars — skipping\n`);
      continue;
    }
    process.stderr.write(`[sync]   ${tab.slug}: ${md.length} chars of markdown\n`);

    stmts.push(`-- ${tab.slug}  ← sheet "${tab.sheet}" (gid ${tab.gid})`);
    // English master into the VI source row (canonical body the pipeline reads).
    stmts.push(
      `UPDATE shipping_routes SET body_md = '${sqlEscape(md)}', notes_json = NULL ` +
        `WHERE slug = '${tab.slug}' AND locale = 'vi';`,
    );
    // Drop stale 0028 tables for this route (sheet policy is prose, not tables).
    stmts.push(
      `DELETE FROM shipping_route_tables WHERE route_id IN ` +
        `(SELECT id FROM shipping_routes WHERE slug = '${tab.slug}');`,
    );
    // Drop any backfilled translations so the EN/ZH pages fall back to the VI
    // source until the operator re-translates via Sparkles (avoids showing the
    // old empty/stale en/zh translation rows over the fresh source).
    stmts.push(
      `DELETE FROM shipping_route_translations WHERE shipping_route_id IN ` +
        `(SELECT id FROM shipping_routes WHERE slug = '${tab.slug}');`,
    );
    stmts.push("");
  }

  const { writeFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const outPath = resolve(process.cwd(), OUT_REL);
  writeFileSync(outPath, stmts.join("\n"), "utf8");
  process.stderr.write(`\n[sync] wrote ${outPath}\n`);
  process.stderr.write(`[sync] review it, then apply:\n`);
  process.stderr.write(`[sync]   bunx wrangler d1 execute thg-cms --remote --file=${OUT_REL}\n`);
}

main().catch((err) => {
  process.stderr.write(`[sync] FAILED: ${err.message}\n`);
  process.exit(1);
});
