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
