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
  return { id, kind: input.kind, position, payload: input.payload, locale: input.locale };
}
