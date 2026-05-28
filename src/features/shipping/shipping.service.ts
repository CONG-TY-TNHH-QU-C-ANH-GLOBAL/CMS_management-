// Shipping Routes service — read + write CRUD.
// Each route = one transit pattern (VN→US standard, CN→US batteries, etc).
// Per-locale row + nested zone tables stored in shipping_route_tables.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type ShippingLocale = "en" | "vi" | "zh";
export type ShippingStatus = "draft" | "live" | "archived";

export interface ShippingRouteRow {
  id: number;
  slug: string;
  locale: ShippingLocale;
  position: number;
  title: string;
  origin: string | null;
  destination: string | null;
  kind: string | null;
  body_md: string | null;
  notes_json: string | null;
  status: ShippingStatus;
  updated_at: number;
}

export interface ShippingTableRow {
  id: number;
  route_id: number;
  position: number;
  caption: string | null;
  columns_json: string;
  rows_json: string;
}

export async function listShippingRoutes(filter?: {
  locale?: ShippingLocale;
  status?: ShippingStatus;
}): Promise<ShippingRouteRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter?.locale) { where.push("locale = ?"); binds.push(filter.locale); }
  if (filter?.status) { where.push("status = ?"); binds.push(filter.status); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `SELECT * FROM shipping_routes ${whereClause} ORDER BY position, slug`;
  const stmt = binds.length > 0 ? getDb().prepare(sql).bind(...binds) : getDb().prepare(sql);
  const result = await stmt.all<ShippingRouteRow>();
  return result.results ?? [];
}

export async function getShippingRoute(slug: string, locale: ShippingLocale): Promise<ShippingRouteRow | null> {
  const result = await getDb()
    .prepare(`SELECT * FROM shipping_routes WHERE slug = ? AND locale = ? LIMIT 1`)
    .bind(slug, locale)
    .first<ShippingRouteRow>();
  return result ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Public-facing reads (spec §7.1 — JOIN shipping_route_translations)
// ────────────────────────────────────────────────────────────────────────
// Translated columns (top-level only): title, body_md, notes_json.
// Non-translated: slug, position, origin, destination, kind, status,
// updated_at. Nested shipping_route_tables NOT yet translatable — those
// are served from the per-locale route's tables until follow-up PR.
//
// LEGACY FALLBACK
// ───────────────
// Reads use a two-step resolver, returning the first non-empty path:
//   1. VI-canonical: JOIN VI source row + shipping_route_translations
//      filtered by status='reviewed'.
//   2. Legacy fallback: read shipping_routes.locale=<requested> directly.
// This preserves data for slugs that pre-date the AI-localization pipeline:
//   - slugs whose VI source row never existed (EN-canonical historical data)
//   - slugs whose VI status differs from the legacy locale row status
//   - slugs whose translation is draft/stale (not yet reviewed) — operator
//     sees old approved content until they re-approve through Sparkles
// The fallback is a no-op for fully-migrated data (VI exists + translation
// is reviewed), which is the steady-state goal. See spec §7.2.

export async function listShippingRoutesForPublic(filter?: {
  locale: ShippingLocale;
  status?: ShippingStatus;
}): Promise<ShippingRouteRow[]> {
  if (!filter?.locale || filter.locale === "vi") {
    return listShippingRoutes({ locale: "vi", status: filter?.status });
  }

  // Step 1 — VI-canonical: JOIN VI source + reviewed translation
  const where: string[] = ["v.locale = 'vi'"];
  const binds: unknown[] = [filter.locale, filter.locale];
  if (filter.status) { where.push("v.status = ?"); binds.push(filter.status); }
  const viBackedSql = `
    SELECT v.id, v.slug, ? AS locale, v.position, t.title, v.origin, v.destination,
           v.kind, t.body_md, t.notes_json, v.status, v.updated_at
      FROM shipping_routes v
      JOIN shipping_route_translations t
        ON t.shipping_route_id = v.id AND t.locale = ? AND t.status = 'reviewed'
     WHERE ${where.join(" AND ")}
     ORDER BY v.position, v.slug
  `;
  const viBacked = await getDb().prepare(viBackedSql).bind(...binds).all<ShippingRouteRow>();
  const viBackedRows = viBacked.results ?? [];
  const viBackedSlugs = new Set(viBackedRows.map((r) => r.slug));

  // Step 2 — Legacy fallback for slugs not produced by Step 1
  const legacyWhere: string[] = ["sr.locale = ?"];
  const legacyBinds: unknown[] = [filter.locale];
  if (filter.status) { legacyWhere.push("sr.status = ?"); legacyBinds.push(filter.status); }
  const legacySql = `
    SELECT * FROM shipping_routes sr
     WHERE ${legacyWhere.join(" AND ")}
     ORDER BY sr.position, sr.slug
  `;
  const legacy = await getDb().prepare(legacySql).bind(...legacyBinds).all<ShippingRouteRow>();
  const fallback = (legacy.results ?? []).filter((r) => !viBackedSlugs.has(r.slug));

  return [...viBackedRows, ...fallback].sort(
    (a, b) => a.position - b.position || a.slug.localeCompare(b.slug),
  );
}

export async function getShippingRouteForPublic(
  slug: string,
  locale: ShippingLocale,
): Promise<ShippingRouteRow | null> {
  if (locale === "vi") return getShippingRoute(slug, "vi");

  const viBacked = await getDb()
    .prepare(
      `SELECT v.id, v.slug, ? AS locale, v.position, t.title, v.origin, v.destination,
              v.kind, t.body_md, t.notes_json, v.status, v.updated_at
         FROM shipping_routes v
         JOIN shipping_route_translations t
           ON t.shipping_route_id = v.id AND t.locale = ? AND t.status = 'reviewed'
        WHERE v.slug = ? AND v.locale = 'vi' LIMIT 1`,
    )
    .bind(locale, locale, slug)
    .first<ShippingRouteRow>();
  if (viBacked) return viBacked;
  return getShippingRoute(slug, locale);
}

export async function getShippingTables(routeId: number): Promise<ShippingTableRow[]> {
  const result = await getDb()
    .prepare(`SELECT * FROM shipping_route_tables WHERE route_id = ? ORDER BY position`)
    .bind(routeId)
    .all<ShippingTableRow>();
  return result.results ?? [];
}

/** Load tables by (slug, locale) directly. shipping_route_tables is keyed
 *  by route_id, which historically points at the per-locale legacy row
 *  (not the VI source). After we shifted the public reader to a VI-backed
 *  JOIN, route.id became vi.id for matched rows — getShippingTables(vi.id)
 *  then returned [] because no tables were ever hung off the VI row. This
 *  helper sidesteps that mismatch by resolving through (slug, locale).
 *  Falls back to VI source's tables when the requested locale row doesn't
 *  exist (e.g., VI-only data, or after operator deletes a legacy row). */
export async function getShippingTablesForSlug(
  slug: string,
  locale: ShippingLocale,
): Promise<ShippingTableRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT srt.* FROM shipping_route_tables srt
         JOIN shipping_routes sr ON sr.id = srt.route_id
        WHERE sr.slug = ? AND sr.locale = ?
        ORDER BY srt.position`,
    )
    .bind(slug, locale)
    .all<ShippingTableRow>();
  if ((result.results ?? []).length > 0) return result.results ?? [];

  // No tables found for the requested locale — fall back to whichever
  // locale has tables (preference: vi, then en, then zh). Preserves the
  // pre-migration behavior where any one locale's tables would render.
  for (const fallbackLocale of ["vi", "en", "zh"] as const) {
    if (fallbackLocale === locale) continue;
    const fb = await getDb()
      .prepare(
        `SELECT srt.* FROM shipping_route_tables srt
           JOIN shipping_routes sr ON sr.id = srt.route_id
          WHERE sr.slug = ? AND sr.locale = ?
          ORDER BY srt.position`,
      )
      .bind(slug, fallbackLocale)
      .all<ShippingTableRow>();
    if ((fb.results ?? []).length > 0) return fb.results ?? [];
  }
  return [];
}

export async function listShippingRoutesGrouped(): Promise<
  Array<{ slug: string; position: number; kind: string | null; updated_at: number; variants: ShippingRouteRow[] }>
> {
  const all = await listShippingRoutes();
  const map = new Map<string, ShippingRouteRow[]>();
  for (const r of all) {
    if (!map.has(r.slug)) map.set(r.slug, []);
    map.get(r.slug)!.push(r);
  }
  return Array.from(map.entries()).map(([slug, variants]) => {
    const ref = variants[0];
    return {
      slug,
      position: ref.position,
      kind: ref.kind,
      updated_at: Math.max(...variants.map((v) => v.updated_at)),
      variants,
    };
  }).sort((a, b) => a.position - b.position);
}

// ─────────────── mutations ───────────────

export async function upsertShippingRoute(
  actorId: number,
  input: {
    slug: string;
    locale: ShippingLocale;
    position?: number;
    title: string;
    origin?: string | null;
    destination?: string | null;
    kind?: string | null;
    body_md?: string | null;
    notes?: string[] | null;
    status?: ShippingStatus;
  },
): Promise<ShippingRouteRow> {
  const before = await getShippingRoute(input.slug, input.locale);
  const notesJson = input.notes !== undefined ? (input.notes ? JSON.stringify(input.notes) : null) : undefined;

  if (before) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
    if (input.position !== undefined) { fields.push("position = ?"); values.push(input.position); }
    if (input.origin !== undefined) { fields.push("origin = ?"); values.push(input.origin); }
    if (input.destination !== undefined) { fields.push("destination = ?"); values.push(input.destination); }
    if (input.kind !== undefined) { fields.push("kind = ?"); values.push(input.kind); }
    if (input.body_md !== undefined) { fields.push("body_md = ?"); values.push(input.body_md); }
    if (notesJson !== undefined) { fields.push("notes_json = ?"); values.push(notesJson); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    fields.push("updated_at = unixepoch()");
    values.push(input.slug, input.locale);
    if (fields.length > 1) {
      await getDb().prepare(`UPDATE shipping_routes SET ${fields.join(", ")} WHERE slug = ? AND locale = ?`).bind(...values).run();
    }
  } else {
    await getDb()
      .prepare(
        `INSERT INTO shipping_routes (slug, locale, position, title, origin, destination, kind, body_md, notes_json, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      )
      .bind(
        input.slug,
        input.locale,
        input.position ?? 99,
        input.title,
        input.origin ?? null,
        input.destination ?? null,
        input.kind ?? null,
        input.body_md ?? null,
        notesJson ?? null,
        input.status ?? "live",
      )
      .run();
  }
  const after = await getShippingRoute(input.slug, input.locale);
  await auditLog(actorId, before ? "update" : "create", "shipping_routes", `${input.slug}:${input.locale}`, before, after);

  // AI-localization hook (Phase 8): on VI save with title/body/notes touched,
  // mark dependent translations stale + auto-create missing-locale drafts.
  if (
    after &&
    after.locale === "vi" &&
    (input.title !== undefined ||
      input.body_md !== undefined ||
      input.notes !== undefined)
  ) {
    try {
      const { onShippingRouteSourceChanged, autoTranslateMissingLocales } = await import(
        "@/features/translations"
      );
      await onShippingRouteSourceChanged(after.id, {
        title: after.title,
        body_md: after.body_md,
        notes_json: after.notes_json,
      });
      await autoTranslateMissingLocales(actorId, "shipping_route", after.id);
    } catch (err) {
      console.error("[shipping_routes] onShippingRouteSourceChanged failed", err);
    }
  }

  return after!;
}

// Replace ALL tables for a route. caller passes ordered list of {caption, columns, rows}.
// Each table is stored as a single shipping_route_tables row with JSON cols/rows.
export async function replaceShippingTables(
  actorId: number,
  input: {
    slug: string;
    locale: ShippingLocale;
    tables: Array<{
      caption?: string | null;
      columns: Array<{ key: string; label: string }>;
      rows: Array<Record<string, string | number | null>>;
    }>;
  },
): Promise<ShippingTableRow[]> {
  const route = await getShippingRoute(input.slug, input.locale);
  if (!route) throw Object.assign(new Error("Shipping route không tồn tại."), { statusCode: 404 });

  const before = await getShippingTables(route.id);
  await getDb().prepare(`DELETE FROM shipping_route_tables WHERE route_id = ?`).bind(route.id).run();

  for (let i = 0; i < input.tables.length; i++) {
    const t = input.tables[i];
    await getDb()
      .prepare(
        `INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
           VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(route.id, i, t.caption ?? null, JSON.stringify(t.columns), JSON.stringify(t.rows))
      .run();
  }
  const after = await getShippingTables(route.id);
  await auditLog(actorId, "update", "shipping_route_tables", `${input.slug}:${input.locale}`, before, after);
  return after;
}

export async function deleteShippingRouteSlug(actorId: number, slug: string): Promise<void> {
  const all = await listShippingRoutes();
  const variants = all.filter((r) => r.slug === slug);
  if (variants.length === 0) return;
  await getDb().prepare(`DELETE FROM shipping_routes WHERE slug = ?`).bind(slug).run();
  await auditLog(actorId, "delete", "shipping_routes", slug, variants, null);
}

// ────────────────────────────────────────────────────────────────────────
// Any-source AI translation (spec deviation — shipping is the master-anywhere
// entity). The standard translate pipeline is hard-wired VI→EN/ZH, but
// shipping content can originate in any locale (e.g. the English master sheet).
// This translates one locale row's body_md into the requested target locale
// rows, in-place. Plain-markdown output (NOT the JSON-field pipeline).
// ────────────────────────────────────────────────────────────────────────

const LOCALE_NAMES: Record<ShippingLocale, string> = {
  en: "English",
  vi: "Vietnamese",
  zh: "Chinese (Simplified)",
};

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

async function translateMarkdownPlain(
  apiKey: string,
  md: string,
  targetLangName: string,
  baseUrl: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You localize cross-border shipping policy for THG Fulfill. Translate the ` +
              `user's markdown into ${targetLangName}. STRICT RULES:\n` +
              `- Preserve ALL markdown structure exactly: ## headings, ### subheadings, ` +
              `- bullets, [text](url) links, blank lines, 🚨/⚠/📌 callout prefixes.\n` +
              `- Keep verbatim (do NOT translate): numbers, prices, currency codes/symbols, ` +
              `country codes, dates, URLs, weights/dimensions, and proper nouns/acronyms ` +
              `(THG, Yunexpress, IOSS, USPS, DHL, Evri, VAT, GST, CE, APO/FPO, SKU, HS, VOEC).\n` +
              `- Translate naturally and professionally for a seller audience.\n` +
              `- Output ONLY the translated markdown — no preamble, no code fences.`,
          },
          { role: "user", content: md },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body.error?.message) detail = body.error.message;
      } catch { /* ignore */ }
      throw Object.assign(new Error(`OpenAI: ${detail}`), { statusCode: res.status === 429 ? 429 : 502 });
    }
    const body = (await res.json()) as { choices: Array<{ message: { content: string | null } }> };
    const out = body.choices[0]?.message?.content?.trim() ?? "";
    if (!out) throw Object.assign(new Error("OpenAI returned empty content"), { statusCode: 502 });
    return out;
  } finally {
    clearTimeout(timer);
  }
}

// Retry one section translation on transient failures (429 rate-limit / 5xx /
// timeout). Exponential backoff with jitter. This is what makes per-section
// parallelism safe — a single rate-limited section no longer fails the whole
// route translation.
async function translateMarkdownPlainWithRetry(
  apiKey: string,
  md: string,
  targetLangName: string,
  baseUrl: string,
  attempts = 3,
): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await translateMarkdownPlain(apiKey, md, targetLangName, baseUrl);
    } catch (err) {
      lastErr = err;
      const status = (err as { statusCode?: number })?.statusCode;
      const retryable = status === 429 || status === 502 || (err as Error)?.name === "AbortError";
      if (!retryable || i === attempts - 1) break;
      // 1.2s, 3s, 6s-ish with jitter
      const delay = 1200 * Math.pow(2, i) + Math.floor(Math.random() * 600);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Run async tasks with bounded concurrency, preserving result order. Keeps the
// number of simultaneous OpenAI calls low enough to stay under the account's
// requests/tokens-per-minute limits (the cause of "Vietnamese failed" when all
// ~12 sections fired at once).
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// Max characters per translation chunk. Vietnamese output runs ~1.5-2× the
// English source length (Chinese is far more compact), so a big `##` section
// can blow the per-call timeout in VI even when it's fine in ZH. We cap every
// chunk so the slowest-language output for any chunk stays well under the
// timeout. ~2500 source chars ≈ ~4-5k VI chars ≈ ~20-30s generation.
const MAX_CHUNK_CHARS = 2500;

// Split markdown into translate-sized chunks. First split at `## ` section
// boundaries (intro before the first heading is its own chunk); then any
// section still over MAX_CHUNK_CHARS is sub-split at line boundaries so no
// single chunk is large enough to time out — regardless of target language.
function splitMarkdownSections(md: string): string[] {
  const sections: string[] = [];
  let cur: string[] = [];
  for (const line of md.split("\n")) {
    if (/^##\s+/.test(line) && cur.length > 0) {
      sections.push(cur.join("\n"));
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  if (cur.length > 0) sections.push(cur.join("\n"));

  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= MAX_CHUNK_CHARS) {
      if (section.trim()) chunks.push(section);
      continue;
    }
    // Section too big — pack its lines into ≤ MAX_CHUNK_CHARS sub-chunks,
    // keeping whole lines intact (never split mid-line / mid-bullet).
    let buf: string[] = [];
    let len = 0;
    for (const line of section.split("\n")) {
      if (len + line.length + 1 > MAX_CHUNK_CHARS && buf.length > 0) {
        chunks.push(buf.join("\n"));
        buf = [];
        len = 0;
      }
      buf.push(line);
      len += line.length + 1;
    }
    if (buf.join("").trim()) chunks.push(buf.join("\n"));
  }
  return chunks.filter((c) => c.trim().length > 0);
}

/** Translate a (potentially large) markdown body by section, with bounded
 *  concurrency + per-section retry so rate limits / transient errors don't
 *  fail the whole route. */
async function translateLargeMarkdown(
  apiKey: string,
  md: string,
  targetLangName: string,
  baseUrl: string,
): Promise<string> {
  const sections = splitMarkdownSections(md);
  if (sections.length <= 1) {
    return translateMarkdownPlainWithRetry(apiKey, md, targetLangName, baseUrl);
  }
  // Max 3 concurrent calls — fast enough (≈ ceil(N/3) waves) while staying
  // comfortably under OpenAI rate limits.
  const translated = await mapPool(sections, 3, (s) =>
    translateMarkdownPlainWithRetry(apiKey, s, targetLangName, baseUrl),
  );
  return translated.join("\n\n");
}

/** Translate a route's body_md from one locale into the target locales,
 *  writing the result into each target's locale row. Any source locale is
 *  allowed (en/vi/zh). Targets default to the other two locales. */
export async function translateShippingRouteContent(
  actorId: number,
  apiKey: string,
  input: {
    slug: string;
    sourceLocale: ShippingLocale;
    targetLocales?: ShippingLocale[];
  },
  baseUrl: string = DEFAULT_OPENAI_BASE,
): Promise<{ translated: ShippingLocale[] }> {
  const source = await getShippingRoute(input.slug, input.sourceLocale);
  if (!source) {
    throw Object.assign(new Error(`Không tìm thấy nội dung ${input.sourceLocale} cho ${input.slug}.`), { statusCode: 404 });
  }
  const sourceBody = (source.body_md ?? "").trim();
  if (!sourceBody) {
    throw Object.assign(new Error(`Nội dung ${input.sourceLocale} đang trống — không có gì để dịch.`), { statusCode: 400 });
  }

  const targets = (input.targetLocales ?? (["en", "vi", "zh"] as ShippingLocale[]))
    .filter((l) => l !== input.sourceLocale);

  const done: ShippingLocale[] = [];
  for (const target of targets) {
    const translated = await translateLargeMarkdown(apiKey, sourceBody, LOCALE_NAMES[target], baseUrl);
    await getDb()
      .prepare(`UPDATE shipping_routes SET body_md = ?, updated_at = unixepoch() WHERE slug = ? AND locale = ?`)
      .bind(translated, input.slug, target)
      .run();
    done.push(target);
  }

  await auditLog(actorId, "update", "shipping_routes", `${input.slug}:translate-from-${input.sourceLocale}`, { sourceLocale: input.sourceLocale }, { translated: done });
  return { translated: done };
}
