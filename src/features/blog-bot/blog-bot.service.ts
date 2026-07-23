// Blog Auto-Bot — data layer for blog_bot_campaigns + blog_bot_runs (0038).
//
// Phase 0 scope: campaign CRUD + run reads. No generation engine yet — the
// runs table is created so the admin UI can render an (empty) history feed and
// so the Phase 1 engine has a home to write to without a follow-up migration.
//
// Policy note: campaigns default to autopublish=0 (write status='review'),
// honoring the moderation-first convention. Enabling autopublish is an explicit
// operator opt-in and remains gated by the verifier stage (later phase).

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type BotLocale = "en" | "vi" | "zh";
export type TopicSource = "instruction" | "seed_list";
export type ImageMode = "none" | "ai_generate" | "stock";
export type RunStatus =
  | "pending"
  | "generating"
  | "imaging"
  | "verifying"
  | "needs_review"
  | "published"
  | "failed"
  | "skipped";

export interface BlogBotCampaignRow {
  id: number;
  name: string;
  enabled: number; // 0 | 1
  run_time: string; // "HH:MM"
  timezone: string;
  locale: BotLocale;
  category: string | null;
  tone: string | null;
  topic_source: TopicSource;
  instruction_md: string | null;
  seed_topics_json: string | null;
  guidelines_md: string | null;
  image_mode: ImageMode;
  image_style: string | null;
  autopublish: number; // 0 | 1
  autoapprove_translations: number; // 0 | 1 — auto-approve EN/ZH on publish
  model: string;
  max_per_day: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface BlogBotRunRow {
  id: number;
  campaign_id: number;
  status: RunStatus;
  trigger: "schedule" | "manual";
  topic: string | null;
  blog_post_id: number | null;
  blog_slug: string | null;
  verdict_json: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  error: string | null;
  in_flight_until: number | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

// ─────────────── reads ───────────────

export async function listCampaigns(): Promise<BlogBotCampaignRow[]> {
  const res = await getDb()
    .prepare(`SELECT * FROM blog_bot_campaigns ORDER BY created_at DESC`)
    .all<BlogBotCampaignRow>();
  return res.results ?? [];
}

export async function getCampaign(id: number): Promise<BlogBotCampaignRow | null> {
  return await getDb()
    .prepare(`SELECT * FROM blog_bot_campaigns WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<BlogBotCampaignRow>();
}

/** Enabled campaigns only — the cron scheduler's candidate set. */
export async function listEnabledCampaigns(): Promise<BlogBotCampaignRow[]> {
  const res = await getDb()
    .prepare(`SELECT * FROM blog_bot_campaigns WHERE enabled = 1 ORDER BY id`)
    .all<BlogBotCampaignRow>();
  return res.results ?? [];
}

export async function listRuns(campaignId: number | null, limit = 50): Promise<BlogBotRunRow[]> {
  const capped = Math.min(Math.max(limit, 1), 200);
  const res = campaignId
    ? await getDb()
        .prepare(
          `SELECT * FROM blog_bot_runs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(campaignId, capped)
        .all<BlogBotRunRow>()
    : await getDb()
        .prepare(`SELECT * FROM blog_bot_runs ORDER BY created_at DESC LIMIT ?`)
        .bind(capped)
        .all<BlogBotRunRow>();
  return res.results ?? [];
}

// ─────────────── writes ───────────────

export interface CampaignInput {
  name: string;
  enabled?: boolean;
  run_time?: string;
  timezone?: string;
  locale?: BotLocale;
  category?: string | null;
  tone?: string | null;
  topic_source?: TopicSource;
  instruction_md?: string | null;
  seed_topics_json?: string | null;
  guidelines_md?: string | null;
  image_mode?: ImageMode;
  image_style?: string | null;
  autopublish?: boolean;
  autoapprove_translations?: boolean;
  model?: string;
  max_per_day?: number;
}

// Columns a partial UPDATE may touch, plus their boolean-ness (booleans map to
// 0/1). Keeps updateCampaign a boring dynamic UPDATE with no per-field ifs.
const UPDATABLE: Array<{ key: keyof CampaignInput; bool?: boolean }> = [
  { key: "name" },
  { key: "enabled", bool: true },
  { key: "run_time" },
  { key: "timezone" },
  { key: "locale" },
  { key: "category" },
  { key: "tone" },
  { key: "topic_source" },
  { key: "instruction_md" },
  { key: "seed_topics_json" },
  { key: "guidelines_md" },
  { key: "image_mode" },
  { key: "image_style" },
  { key: "autopublish", bool: true },
  { key: "autoapprove_translations", bool: true },
  { key: "model" },
  { key: "max_per_day" },
];

export async function createCampaign(
  actorId: number,
  input: CampaignInput,
): Promise<BlogBotCampaignRow> {
  const row = await getDb()
    .prepare(
      `INSERT INTO blog_bot_campaigns
         (name, enabled, run_time, timezone, locale, category, tone,
          topic_source, instruction_md, seed_topics_json, guidelines_md,
          image_mode, image_style, autopublish, autoapprove_translations,
          model, max_per_day, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      input.name,
      input.enabled ? 1 : 0,
      input.run_time ?? "08:00",
      input.timezone ?? "Asia/Ho_Chi_Minh",
      input.locale ?? "vi",
      input.category ?? null,
      input.tone ?? null,
      input.topic_source ?? "instruction",
      input.instruction_md ?? null,
      input.seed_topics_json ?? null,
      input.guidelines_md ?? null,
      input.image_mode ?? "none",
      input.image_style ?? null,
      input.autopublish ? 1 : 0,
      input.autoapprove_translations ? 1 : 0,
      input.model ?? "gpt-4o",
      input.max_per_day ?? 1,
      actorId,
    )
    .first<BlogBotCampaignRow>();
  if (!row) throw new Error("createCampaign: insert returned no row");
  await auditLog(actorId, "create", "blog_bot_campaign", row.id, null, row);
  return row;
}

export async function updateCampaign(
  actorId: number,
  id: number,
  input: Partial<CampaignInput>,
): Promise<BlogBotCampaignRow> {
  const before = await getCampaign(id);
  if (!before) throw Object.assign(new Error("Campaign không tồn tại"), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const { key, bool } of UPDATABLE) {
    const value = input[key];
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(bool ? (value ? 1 : 0) : value);
  }
  if (fields.length > 0) {
    fields.push("updated_at = unixepoch()");
    await getDb()
      .prepare(`UPDATE blog_bot_campaigns SET ${fields.join(", ")} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }

  const after = await getCampaign(id);
  await auditLog(actorId, "update", "blog_bot_campaign", id, before, after);
  return after as BlogBotCampaignRow;
}

export async function deleteCampaign(actorId: number, id: number): Promise<void> {
  const before = await getCampaign(id);
  if (!before) return;
  // blog_bot_runs cascades via FK documentation; delete explicitly since D1
  // does not enforce ON DELETE CASCADE at runtime.
  await getDb().prepare(`DELETE FROM blog_bot_runs WHERE campaign_id = ?`).bind(id).run();
  await getDb().prepare(`DELETE FROM blog_bot_campaigns WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "blog_bot_campaign", id, before, null);
}

export async function touchCampaignRun(id: number, nextRunAt: number | null): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE blog_bot_campaigns SET last_run_at = unixepoch(), next_run_at = ?, updated_at = unixepoch() WHERE id = ?`,
    )
    .bind(nextRunAt, id)
    .run();
}

// ─────────────── runs ───────────────

export async function getRun(id: number): Promise<BlogBotRunRow | null> {
  return await getDb()
    .prepare(`SELECT * FROM blog_bot_runs WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<BlogBotRunRow>();
}

export async function createRun(
  campaignId: number,
  trigger: "schedule" | "manual",
  topic: string | null,
): Promise<BlogBotRunRow> {
  const row = await getDb()
    .prepare(
      `INSERT INTO blog_bot_runs (campaign_id, status, trigger, topic)
       VALUES (?, 'pending', ?, ?) RETURNING *`,
    )
    .bind(campaignId, trigger, topic)
    .first<BlogBotRunRow>();
  if (!row) throw new Error("createRun: insert returned no row");
  return row;
}

export interface RunPatch {
  status?: RunStatus;
  topic?: string | null;
  blog_post_id?: number | null;
  blog_slug?: string | null;
  verdict_json?: string | null;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  error?: string | null;
  in_flight_until?: number | null;
  attempts?: number;
}

export async function updateRun(id: number, patch: RunPatch): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = unixepoch()");
  await getDb()
    .prepare(`UPDATE blog_bot_runs SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();
}

/** Recent blog post titles (VI source rows) — handed to the model so it avoids
 *  regenerating an existing article. */
export async function getRecentBlogTitles(limit = 40): Promise<string[]> {
  const res = await getDb()
    .prepare(`SELECT title FROM blog_posts WHERE locale = 'vi' ORDER BY updated_at DESC LIMIT ?`)
    .bind(Math.min(Math.max(limit, 1), 200))
    .all<{ title: string }>();
  return (res.results ?? []).map((r) => r.title);
}

export async function slugExists(slug: string): Promise<boolean> {
  const row = await getDb()
    .prepare(`SELECT 1 AS n FROM blog_posts WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .first<{ n: number }>();
  return !!row;
}

/** Topics already consumed by prior runs of a campaign — used to rotate through
 *  a seed_list without repeating. */
export async function getUsedTopics(campaignId: number): Promise<string[]> {
  const res = await getDb()
    .prepare(`SELECT DISTINCT topic FROM blog_bot_runs WHERE campaign_id = ? AND topic IS NOT NULL`)
    .bind(campaignId)
    .all<{ topic: string }>();
  return (res.results ?? []).map((r) => r.topic);
}

/** How many runs a campaign already created today (unixepoch day bucket in
 *  UTC — good enough for a per-day quota guard). */
export async function countRunsSince(campaignId: number, sinceEpoch: number): Promise<number> {
  const row = await getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM blog_bot_runs
        WHERE campaign_id = ? AND created_at >= ? AND status NOT IN ('skipped', 'failed')`,
    )
    .bind(campaignId, sinceEpoch)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
