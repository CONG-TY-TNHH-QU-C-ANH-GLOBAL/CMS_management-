// Homepage blocks — locale-aware structured payloads for the "/" route.
//
// Reads/writes to the `homepage_blocks` table (page_id, kind, position,
// payload_json, locale). One page row per locale lives in `pages`. Admin
// landing editor surfaces 1 row per (kind, locale); save = upsert one block.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type HomepageLocale = "en" | "vi" | "zh";

export type HomepageBlockKind =
  | "hero"
  | "trust"
  | "services_grid"
  | "about_video"
  | "marquee"
  | "sellers"
  | "process"
  | "advantages"
  | "integrations"
  | "testimonials"
  | "faq"
  | "contact";

export interface HomepageBlockRow {
  id: number;
  page_id: number;
  kind: HomepageBlockKind;
  position: number;
  payload_json: string;
  locale: HomepageLocale;
}

// Payload values are strings only — operator edits via text inputs in admin.
// Keep narrow on purpose so TanStack Start can serialize across the RPC boundary.
export type HomepagePayload = Record<string, string>;

export interface HomepageBlock {
  id: number;
  kind: HomepageBlockKind;
  position: number;
  payload: HomepagePayload;
  locale: HomepageLocale;
}

function safeParse(s: string): HomepagePayload {
  try {
    const v = JSON.parse(s);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    // Coerce nested values to strings — admin form only edits strings.
    const out: HomepagePayload = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = val == null ? "" : typeof val === "string" ? val : String(val);
    }
    return out;
  } catch {
    return {};
  }
}

async function getHomepagePageId(locale: HomepageLocale): Promise<number | null> {
  const row = await getDb()
    .prepare(`SELECT id FROM pages WHERE route = '/' AND locale = ? LIMIT 1`)
    .bind(locale)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function listHomepageBlocks(locale: HomepageLocale): Promise<HomepageBlock[]> {
  const pageId = await getHomepagePageId(locale);
  if (pageId === null) return [];
  const res = await getDb()
    .prepare(
      `SELECT id, kind, position, payload_json, locale
         FROM homepage_blocks
         WHERE page_id = ? AND locale = ?
         ORDER BY position`,
    )
    .bind(pageId, locale)
    .all<{ id: number; kind: HomepageBlockKind; position: number; payload_json: string; locale: HomepageLocale }>();
  return (res.results ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    position: r.position,
    payload: safeParse(r.payload_json),
    locale: r.locale,
  }));
}

/** Public-facing read for a single locale, translation-gated for en/zh.
 *  Mirrors listFaqsForLocale + listServiceBlocksForLocale (spec §7.1).
 *  - lang='vi' → returns VI rows from `homepage_blocks` directly.
 *  - lang='en'|'zh' → JOINs `homepage_block_translations` and serves ONLY
 *    rows where status='reviewed'. Drafts / stale / failed stay invisible.
 *
 *  Non-translatable columns (kind, position) come from the VI source row.
 *  payload_json comes from the translation row. NO cross-locale fallback
 *  (spec §7.2 + Rule 15) — missing reviewed rows simply omit; landing's
 *  static i18n.tsx + per-component fallback covers the gap. */
export async function listHomepageBlocksForLocale(
  lang: HomepageLocale,
): Promise<HomepageBlock[]> {
  if (lang === "vi") {
    return listHomepageBlocks("vi");
  }
  // VI source rows live under the VI page row; translations are linked by the
  // homepage_block.id, so we anchor on the VI page.
  const viPageId = await getHomepagePageId("vi");
  if (viPageId === null) return [];
  const res = await getDb()
    .prepare(
      `SELECT hb.id, hb.kind, hb.position, t.payload_json, ? AS locale
         FROM homepage_blocks hb
         JOIN homepage_block_translations t
           ON t.homepage_block_id = hb.id AND t.locale = ? AND t.status = 'reviewed'
        WHERE hb.page_id = ? AND hb.locale = 'vi'
        ORDER BY hb.position`,
    )
    .bind(lang, lang, viPageId)
    .all<{ id: number; kind: HomepageBlockKind; position: number; payload_json: string; locale: HomepageLocale }>();
  return (res.results ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    position: r.position,
    payload: safeParse(r.payload_json),
    locale: r.locale,
  }));
}

export interface UpsertHomepageBlockInput {
  kind: HomepageBlockKind;
  locale: HomepageLocale;
  payload: HomepagePayload;
  position?: number;
}

export async function upsertHomepageBlock(
  actorId: number,
  input: UpsertHomepageBlockInput,
): Promise<HomepageBlock> {
  const pageId = await getHomepagePageId(input.locale);
  if (pageId === null) {
    throw new Error(`Homepage row for locale "${input.locale}" not seeded. Run migration 0012.`);
  }

  const existing = await getDb()
    .prepare(
      `SELECT id, kind, position, payload_json, locale
         FROM homepage_blocks
         WHERE page_id = ? AND kind = ? AND locale = ?
         LIMIT 1`,
    )
    .bind(pageId, input.kind, input.locale)
    .first<HomepageBlockRow>();

  const payloadJson = JSON.stringify(input.payload);

  if (existing) {
    const newPos = input.position ?? existing.position;
    await getDb()
      .prepare(
        `UPDATE homepage_blocks SET payload_json = ?, position = ? WHERE id = ?`,
      )
      .bind(payloadJson, newPos, existing.id)
      .run();
    const after = { ...existing, payload_json: payloadJson, position: newPos };
    await auditLog(actorId, "update", "homepage_blocks", existing.id, existing, after);

    // Spec §3.3 + §11.7 + auto-translate (Phase 7): when VI source row payload
    // changes, mark dependent EN/ZH translations stale, then auto-create
    // drafts for any locale that has no translation row yet. Both wrapped in
    // try/catch so a translation pipeline failure doesn't roll back the
    // source save itself.
    if (input.locale === "vi" && existing.payload_json !== payloadJson) {
      try {
        const { onHomepageBlockSourceChanged, autoTranslateMissingLocales } = await import(
          "@/features/translations"
        );
        await onHomepageBlockSourceChanged(existing.id, { payload_json: payloadJson });
        await autoTranslateMissingLocales(actorId, "homepage_block", existing.id);
      } catch (err) {
        console.error("[homepage_blocks] translation pipeline failed", err);
      }
    }

    return {
      id: existing.id,
      kind: existing.kind,
      position: newPos,
      payload: input.payload,
      locale: existing.locale,
    };
  }

  // Insert — default position to end of list
  const maxPos = await getDb()
    .prepare(`SELECT COALESCE(MAX(position), -1) AS p FROM homepage_blocks WHERE page_id = ? AND locale = ?`)
    .bind(pageId, input.locale)
    .first<{ p: number }>();
  const position = input.position ?? (maxPos?.p ?? -1) + 1;

  const result = await getDb()
    .prepare(
      `INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
         VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(pageId, input.kind, position, payloadJson, input.locale)
    .run();
  const id = result.meta.last_row_id as number;
  await auditLog(actorId, "create", "homepage_blocks", id, null, {
    page_id: pageId,
    kind: input.kind,
    position,
    payload_json: payloadJson,
    locale: input.locale,
  });

  // Auto-create EN+ZH drafts on first VI insert (operator gets translations
  // immediately on the EN/ZH tabs, still requires Approve before going live).
  if (input.locale === "vi") {
    try {
      const { autoTranslateMissingLocales } = await import("@/features/translations");
      await autoTranslateMissingLocales(actorId, "homepage_block", id);
    } catch (err) {
      console.error("[homepage_blocks] autoTranslateMissingLocales failed", err);
    }
  }

  return { id, kind: input.kind, position, payload: input.payload, locale: input.locale };
}
