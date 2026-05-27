// Policies service — refund / shipping / privacy / etc CRUD.
// Schema extended 2026-05-11 with icon, mode (image|text), image_list_json, summary, position.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type PolicyLocale = "en" | "vi" | "zh";
export type PolicyMode = "image" | "text";

export interface PolicyTextBlock {
  type: "normal" | "warn" | "info";
  heading: string;
  content: string[];
}

export interface PolicyRow {
  id: number;
  slug: string;
  locale: PolicyLocale;
  title: string;
  body_md: string;
  version: number;
  updated_at: number;
  icon: string | null;
  mode: PolicyMode;
  image_list_json: string | null;
  text_blocks_json: string | null;
  summary: string | null;
  position: number;
}

export async function listPolicies(filter?: { locale?: PolicyLocale }): Promise<PolicyRow[]> {
  const sql = filter?.locale
    ? `SELECT * FROM policies WHERE locale = ? ORDER BY position, slug`
    : `SELECT * FROM policies ORDER BY position, slug, locale`;
  const stmt = filter?.locale ? getDb().prepare(sql).bind(filter.locale) : getDb().prepare(sql);
  const result = await stmt.all<PolicyRow>();
  return result.results ?? [];
}

export async function getPolicy(slug: string, locale: PolicyLocale): Promise<PolicyRow | null> {
  const result = await getDb()
    .prepare(`SELECT * FROM policies WHERE slug = ? AND locale = ? LIMIT 1`)
    .bind(slug, locale)
    .first<PolicyRow>();
  return result ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Public-facing reads (spec §7.1 — JOIN policy_translations)
// ────────────────────────────────────────────────────────────────────────
// Translated columns: title, body_md, summary, text_blocks_json.
// Non-translated: slug, version, icon, mode, position, image_list_json,
// updated_at.

export async function listPoliciesForPublic(filter?: { locale: PolicyLocale }): Promise<PolicyRow[]> {
  if (!filter?.locale || filter.locale === "vi") return listPolicies({ locale: "vi" });

  const sql = `
    SELECT p.id, p.slug, ? AS locale, t.title, t.body_md, p.version, p.updated_at,
           p.icon, p.mode, p.image_list_json, t.text_blocks_json, t.summary, p.position
      FROM policies p
      JOIN policy_translations t
        ON t.policy_id = p.id AND t.locale = ? AND t.status = 'reviewed'
     WHERE p.locale = 'vi'
     ORDER BY p.position, p.slug
  `;
  const result = await getDb().prepare(sql).bind(filter.locale, filter.locale).all<PolicyRow>();
  return result.results ?? [];
}

export async function getPolicyForPublic(slug: string, locale: PolicyLocale): Promise<PolicyRow | null> {
  if (locale === "vi") return getPolicy(slug, "vi");

  const result = await getDb()
    .prepare(
      `SELECT p.id, p.slug, ? AS locale, t.title, t.body_md, p.version, p.updated_at,
              p.icon, p.mode, p.image_list_json, t.text_blocks_json, t.summary, p.position
         FROM policies p
         JOIN policy_translations t
           ON t.policy_id = p.id AND t.locale = ? AND t.status = 'reviewed'
        WHERE p.slug = ? AND p.locale = 'vi' LIMIT 1`,
    )
    .bind(locale, locale, slug)
    .first<PolicyRow>();
  return result ?? null;
}

// Group by slug → variants per locale (admin list view)
export async function listPoliciesGrouped(): Promise<
  Array<{ slug: string; icon: string | null; position: number; updated_at: number; variants: PolicyRow[] }>
> {
  const all = await listPolicies();
  const map = new Map<string, PolicyRow[]>();
  for (const p of all) {
    if (!map.has(p.slug)) map.set(p.slug, []);
    map.get(p.slug)!.push(p);
  }
  return Array.from(map.entries()).map(([slug, variants]) => {
    const ref = variants[0];
    return {
      slug,
      icon: ref.icon,
      position: ref.position,
      updated_at: Math.max(...variants.map((v) => v.updated_at)),
      variants,
    };
  }).sort((a, b) => a.position - b.position);
}

// ───────────── mutations ─────────────

export async function upsertPolicy(
  actorId: number,
  input: {
    slug: string;
    locale: PolicyLocale;
    title: string;
    body_md?: string;
    icon?: string | null;
    mode?: PolicyMode;
    image_list?: string[] | null;
    text_blocks?: PolicyTextBlock[] | null;
    summary?: string | null;
    position?: number;
  },
): Promise<PolicyRow> {
  const before = await getPolicy(input.slug, input.locale);
  const imageJson = input.image_list !== undefined ? (input.image_list ? JSON.stringify(input.image_list) : null) : undefined;
  const textBlocksJson = input.text_blocks !== undefined ? (input.text_blocks ? JSON.stringify(input.text_blocks) : null) : undefined;

  if (before) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
    if (input.body_md !== undefined) { fields.push("body_md = ?"); values.push(input.body_md); }
    if (input.icon !== undefined) { fields.push("icon = ?"); values.push(input.icon); }
    if (input.mode !== undefined) { fields.push("mode = ?"); values.push(input.mode); }
    if (imageJson !== undefined) { fields.push("image_list_json = ?"); values.push(imageJson); }
    if (textBlocksJson !== undefined) { fields.push("text_blocks_json = ?"); values.push(textBlocksJson); }
    if (input.summary !== undefined) { fields.push("summary = ?"); values.push(input.summary); }
    if (input.position !== undefined) { fields.push("position = ?"); values.push(input.position); }
    fields.push("version = version + 1");
    fields.push("updated_at = unixepoch()");
    values.push(input.slug, input.locale);
    if (fields.length > 2) {
      await getDb().prepare(`UPDATE policies SET ${fields.join(", ")} WHERE slug = ? AND locale = ?`).bind(...values).run();
    }
  } else {
    await getDb()
      .prepare(
        `INSERT INTO policies (slug, locale, title, body_md, version, updated_at, icon, mode, image_list_json, text_blocks_json, summary, position)
           VALUES (?, ?, ?, ?, 1, unixepoch(), ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.slug,
        input.locale,
        input.title,
        input.body_md ?? "",
        input.icon ?? null,
        input.mode ?? "text",
        imageJson ?? null,
        textBlocksJson ?? null,
        input.summary ?? null,
        input.position ?? 99,
      )
      .run();
  }
  const after = await getPolicy(input.slug, input.locale);
  await auditLog(actorId, before ? "update" : "create", "policies", `${input.slug}:${input.locale}`, before, after);

  // AI-localization hook (Phase 8): on VI save with any translatable field
  // touched, mark dependent translations stale + auto-create drafts for
  // missing en/zh locales. Best-effort — translation infra failures do not
  // block policy saves.
  if (
    after &&
    after.locale === "vi" &&
    (input.title !== undefined ||
      input.body_md !== undefined ||
      input.summary !== undefined ||
      input.text_blocks !== undefined)
  ) {
    try {
      const { onPolicySourceChanged, autoTranslateMissingLocales } = await import(
        "@/features/translations"
      );
      await onPolicySourceChanged(after.id, {
        title: after.title,
        body_md: after.body_md,
        summary: after.summary,
        text_blocks_json: after.text_blocks_json,
      });
      await autoTranslateMissingLocales(actorId, "policy", after.id);
    } catch (err) {
      console.error("[policies] onPolicySourceChanged failed", err);
    }
  }

  return after!;
}

export async function deletePolicySlug(actorId: number, slug: string): Promise<void> {
  const all = await listPolicies();
  const variants = all.filter((p) => p.slug === slug);
  if (variants.length === 0) return;
  await getDb().prepare(`DELETE FROM policies WHERE slug = ?`).bind(slug).run();
  await auditLog(actorId, "delete", "policies", slug, variants, null);
}
