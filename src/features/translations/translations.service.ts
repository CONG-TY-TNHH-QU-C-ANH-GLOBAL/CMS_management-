// Translation worker — the main /translate orchestration. Loads VI source,
// acquires draft locks, calls OpenAI with JSON recovery, validates output
// per locale, upserts translation rows, writes ai_translation_log.
//
// Per-locale partial failure: each target locale is judged independently.
// EN can land as `draft` even if ZH errors as `failed`. See spec §4.2.
//
// Phase 1 supports `entity_type='faq'` only. Sibling entity types ship in
// Phase 6 with their own loadSource implementations.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";
import { listGlossaryForPrompt } from "./glossary.service";
import { computeSourceHash } from "./translations.hash";
import { insertAiTranslationLog } from "./translations.log.service";
import { callOpenAiWithJsonRecovery, type RecoveryResult } from "./translations.openai";
import { buildPrompt, PROMPT_VERSION_V1 } from "./translations.prompt";
import { computeCostUsd, defaultModelForEntity, type SupportedModel } from "./translations.pricing";
import { hasAllExpectedFields, passesStructuralChecks } from "./translations.structural";

export type TranslateEntityType =
  | "faq"
  | "service_block"
  | "testimonial"
  | "homepage_block"
  | "careers_job"
  | "blog_post"
  | "policy"
  | "contact_location"
  | "shipping_route";
export type TargetLocale = "en" | "zh";

/** Lock TTL — if an in-flight call exceeds this, the lock is considered
 *  stale and a new call may proceed. 60s is safe for a single OpenAI
 *  round-trip (typical 2-4s for gpt-4o-mini, worst-case ~30s on retry). */
const IN_FLIGHT_TTL_SEC = 60;

// ────────────────────────────────────────────────────────────────────────
// Entity registry — single source of truth for which table, FK column,
// and translatable fields belong to each entity type. Adding a new
// entity in Phase 7+ means a new row here + a loadSource case below.
// ────────────────────────────────────────────────────────────────────────

interface EntityConfig {
  translationsTable: string;
  sourceFkColumn: string;
  sourceTable: string;
  /** Translatable column names on the source row. Order matters — it
   *  drives the SQL field list in INSERT/UPDATE/SELECT and the JSON
   *  payload shape sent to OpenAI. */
  fieldColumns: readonly string[];
  /** Per-column placeholder used when inserting failed-stub rows OR when a
   *  successful translate response is missing this column. Defaults to ""
   *  for any column not listed. Must match the column's NOT NULL DEFAULT in
   *  the migration so failed-stub inserts don't violate constraints (e.g.
   *  `requirements_json` defaults to '[]' on careers_job_translations). */
  placeholders?: Readonly<Record<string, string>>;
}

const ENTITY_CONFIG: Record<TranslateEntityType, EntityConfig> = {
  faq: {
    translationsTable: "faq_translations",
    sourceFkColumn: "faq_id",
    sourceTable: "faqs",
    fieldColumns: ["question", "answer"],
  },
  service_block: {
    translationsTable: "service_block_translations",
    sourceFkColumn: "service_block_id",
    sourceTable: "service_blocks",
    fieldColumns: ["title", "description", "payload_json"],
    placeholders: { payload_json: "{}" },
  },
  testimonial: {
    translationsTable: "testimonial_translations",
    sourceFkColumn: "testimonial_id",
    sourceTable: "testimonials",
    fieldColumns: ["quote", "author_role"],
  },
  homepage_block: {
    translationsTable: "homepage_block_translations",
    sourceFkColumn: "homepage_block_id",
    sourceTable: "homepage_blocks",
    fieldColumns: ["payload_json"],
    placeholders: { payload_json: "{}" },
  },
  careers_job: {
    translationsTable: "careers_job_translations",
    sourceFkColumn: "careers_job_id",
    sourceTable: "careers_jobs",
    // Order chosen so structural validation runs cheap text checks first
    // before parsing the heavier JSON columns. Matches the column order
    // in the migration 0023 backfill.
    fieldColumns: [
      "title",
      "body_md",
      "tagline",
      "salary_note",
      "experience",
      "lead",
      "responsibilities_json",
      "requirements_json",
      "benefits_json",
      "bonuses_json",
    ],
    placeholders: {
      // Must match the NOT NULL DEFAULTs in migration 0023, or failed-stub
      // INSERTs (acquireDraftLocks pre-create) would violate the constraint.
      responsibilities_json: "{}",
      requirements_json: "[]",
      benefits_json: "[]",
      bonuses_json: "[]",
    },
  },
  blog_post: {
    translationsTable: "blog_post_translations",
    sourceFkColumn: "blog_post_id",
    sourceTable: "blog_posts",
    fieldColumns: ["title", "excerpt", "category", "seo_title", "seo_description"],
  },
  policy: {
    translationsTable: "policy_translations",
    sourceFkColumn: "policy_id",
    sourceTable: "policies",
    fieldColumns: ["title", "body_md", "summary", "text_blocks_json"],
  },
  contact_location: {
    translationsTable: "contact_location_translations",
    sourceFkColumn: "contact_location_id",
    sourceTable: "contact_locations",
    fieldColumns: ["label", "address"],
  },
  shipping_route: {
    translationsTable: "shipping_route_translations",
    sourceFkColumn: "shipping_route_id",
    sourceTable: "shipping_routes",
    fieldColumns: ["title", "body_md", "notes_json"],
  },
};

// ────────────────────────────────────────────────────────────────────────
// Source loading — VI row from the canonical table
// ────────────────────────────────────────────────────────────────────────

interface LoadedSource {
  fields: Record<string, string>;
}

async function loadSource(
  entityType: TranslateEntityType,
  entityId: number,
): Promise<LoadedSource | null> {
  const cfg = ENTITY_CONFIG[entityType];
  const columnList = cfg.fieldColumns.join(", ");
  const row = await getDb()
    .prepare(
      `SELECT ${columnList} FROM ${cfg.sourceTable}
        WHERE id = ? AND locale = 'vi' LIMIT 1`,
    )
    .bind(entityId)
    .first<Record<string, string | null>>();
  if (!row) return null;
  const fields: Record<string, string> = {};
  for (const col of cfg.fieldColumns) fields[col] = row[col] ?? "";
  return { fields };
}

// ────────────────────────────────────────────────────────────────────────
// Draft lock acquisition (spec §11.1 — duplicate draft protection)
// ────────────────────────────────────────────────────────────────────────

interface LockResult {
  /** Locales where an existing draft row matches the current source_hash
   *  → can be reused; we skip the OpenAI call for these. */
  reusable: TargetLocale[];
  /** Locales currently in-flight (someone else is translating right now).
   *  Caller should reject with 409 to avoid race. */
  inFlight: TargetLocale[];
  /** Locales that need a fresh OpenAI call. */
  toTranslate: TargetLocale[];
}

async function acquireDraftLocks(
  entityType: TranslateEntityType,
  entityId: number,
  targetLocales: TargetLocale[],
  sourceHash: string,
): Promise<LockResult> {
  const cfg = ENTITY_CONFIG[entityType];
  const now = Math.floor(Date.now() / 1000);
  const newExpiry = now + IN_FLIGHT_TTL_SEC;

  const result: LockResult = { reusable: [], inFlight: [], toTranslate: [] };

  // Placeholder columns for the failed-stub INSERT. Most field columns are
  // TEXT and accept '' as a safe placeholder; JSON columns need a valid JSON
  // literal (e.g. '{}' for objects, '[]' for arrays). See cfg.placeholders.
  const placeholderValues = cfg.fieldColumns.map(
    (col) => cfg.placeholders?.[col] ?? "",
  );
  const fieldList = cfg.fieldColumns.join(", ");
  const fieldPlaceholders = cfg.fieldColumns.map(() => "?").join(", ");

  for (const locale of targetLocales) {
    const existing = await getDb()
      .prepare(
        `SELECT id, status, source_hash, in_flight_until
           FROM ${cfg.translationsTable} WHERE ${cfg.sourceFkColumn} = ? AND locale = ? LIMIT 1`,
      )
      .bind(entityId, locale)
      .first<{
        id: number;
        status: string;
        source_hash: string;
        in_flight_until: number | null;
      }>();

    // Currently in-flight (TTL not expired)?
    if (existing?.in_flight_until && existing.in_flight_until > now) {
      result.inFlight.push(locale);
      continue;
    }

    // Existing draft with same source_hash → idempotent reuse.
    if (existing && existing.status === "draft" && existing.source_hash === sourceHash) {
      result.reusable.push(locale);
      continue;
    }

    // Otherwise — we'll translate. Set the in-flight flag now so concurrent
    // callers see the lock. We do NOT delete or overwrite the row content yet;
    // the actual UPSERT happens after OpenAI returns.
    if (existing) {
      await getDb()
        .prepare(`UPDATE ${cfg.translationsTable} SET in_flight_until = ? WHERE id = ?`)
        .bind(newExpiry, existing.id)
        .run();
    } else {
      // Pre-create a placeholder row so concurrent callers see the in-flight
      // lock immediately. Status starts as 'failed' so it's invisible to
      // public API; OpenAI flow upgrades it to draft on success.
      await getDb()
        .prepare(
          `INSERT INTO ${cfg.translationsTable} (
             ${cfg.sourceFkColumn}, locale, ${fieldList}, status, source_hash, in_flight_until
           ) VALUES (?, ?, ${fieldPlaceholders}, 'failed', ?, ?)`,
        )
        .bind(entityId, locale, ...placeholderValues, sourceHash, newExpiry)
        .run();
    }
    result.toTranslate.push(locale);
  }

  return result;
}

async function clearInFlightLock(
  entityType: TranslateEntityType,
  entityId: number,
  locale: TargetLocale,
): Promise<void> {
  const cfg = ENTITY_CONFIG[entityType];
  await getDb()
    .prepare(
      `UPDATE ${cfg.translationsTable} SET in_flight_until = NULL
        WHERE ${cfg.sourceFkColumn} = ? AND locale = ?`,
    )
    .bind(entityId, locale)
    .run();
}

// ────────────────────────────────────────────────────────────────────────
// Upsert translation row after OpenAI returns
// ────────────────────────────────────────────────────────────────────────

interface UpsertInput {
  entityType: TranslateEntityType;
  entityId: number;
  locale: TargetLocale;
  fields: Record<string, string> | null; // null on failed
  status: "draft" | "failed";
  sourceHash: string;
  sourceSnapshot: string | null;
  aiModel: string;
  promptVersion: string;
  actorId: number;
}

async function upsertTranslation(input: UpsertInput): Promise<number> {
  const cfg = ENTITY_CONFIG[input.entityType];
  const now = Math.floor(Date.now() / 1000);

  // Pull translated field values in cfg.fieldColumns order. Falls back to
  // the per-column placeholder (matches NOT NULL DEFAULTs in the migration)
  // when a field is missing — keeps the placeholder row intact on failure.
  const fieldValues = cfg.fieldColumns.map(
    (col) => input.fields?.[col] ?? cfg.placeholders?.[col] ?? "",
  );

  const existing = await getDb()
    .prepare(
      `SELECT id FROM ${cfg.translationsTable}
        WHERE ${cfg.sourceFkColumn} = ? AND locale = ? LIMIT 1`,
    )
    .bind(input.entityId, input.locale)
    .first<{ id: number }>();

  const fieldList = cfg.fieldColumns.join(", ");
  const fieldPlaceholders = cfg.fieldColumns.map(() => "?").join(", ");
  const fieldUpdates = cfg.fieldColumns.map((col) => `${col} = ?`).join(",\n            ");

  if (existing) {
    await getDb()
      .prepare(
        `UPDATE ${cfg.translationsTable} SET
            ${fieldUpdates},
            status = ?,
            stale_reason = NULL,
            source_hash = ?,
            source_snapshot = ?,
            ai_generated_at = ?,
            ai_model = ?,
            prompt_version = ?,
            reviewed_at = NULL,
            reviewed_by = NULL,
            in_flight_until = NULL,
            updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        ...fieldValues,
        input.status,
        input.sourceHash,
        input.sourceSnapshot,
        now,
        input.aiModel,
        input.promptVersion,
        now,
        existing.id,
      )
      .run();
    await auditLog(input.actorId, "update", cfg.translationsTable, existing.id, null, {
      status: input.status,
      ai_generated_at: now,
      locale: input.locale,
    });
    return existing.id;
  }

  const inserted = await getDb()
    .prepare(
      `INSERT INTO ${cfg.translationsTable} (
         ${cfg.sourceFkColumn}, locale, ${fieldList}, status, source_hash, source_snapshot,
         ai_generated_at, ai_model, prompt_version, in_flight_until
       ) VALUES (?, ?, ${fieldPlaceholders}, ?, ?, ?, ?, ?, ?, NULL)
       RETURNING id`,
    )
    .bind(
      input.entityId,
      input.locale,
      ...fieldValues,
      input.status,
      input.sourceHash,
      input.sourceSnapshot,
      now,
      input.aiModel,
      input.promptVersion,
    )
    .first<{ id: number }>();
  if (!inserted) throw new Error(`Failed to insert ${cfg.translationsTable} row`);
  await auditLog(input.actorId, "create", cfg.translationsTable, inserted.id, null, {
    status: input.status,
    ai_generated_at: now,
    locale: input.locale,
  });
  return inserted.id;
}

// ────────────────────────────────────────────────────────────────────────
// Public API — translate()
// ────────────────────────────────────────────────────────────────────────

export interface TranslateInput {
  entity_type: TranslateEntityType;
  entity_id: number;
  target_locales: TargetLocale[];
  /** Override default model for this call. */
  model?: SupportedModel;
  /** Override prompt version. Default = current (PROMPT_VERSION_V1). */
  prompt_version?: string;
}

export interface TranslateOutput {
  /** Translation row IDs (one per target locale, including reused drafts). */
  drafts: { id: number; locale: TargetLocale; status: "draft" | "failed" }[];
  /** Locales that were reused without a new OpenAI call. */
  reused_existing: TargetLocale[];
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  estimated_cost_usd: number;
  /** Log row ID (for forensics drill-down). null if no OpenAI call made. */
  log_id: number | null;
}

export class TranslationInFlightError extends Error {
  constructor(public locales: TargetLocale[]) {
    super(`Translation already in progress for locales: ${locales.join(", ")}`);
    this.name = "TranslationInFlightError";
  }
}

export class TranslationSourceNotFoundError extends Error {
  constructor() {
    super("Source row not found");
    this.name = "TranslationSourceNotFoundError";
  }
}

export class OpenAiKeyMissingError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured on the Worker");
    this.name = "OpenAiKeyMissingError";
  }
}

export async function translate(
  apiKey: string,
  actorId: number,
  input: TranslateInput,
  baseUrl?: string,
): Promise<TranslateOutput> {
  if (!apiKey) throw new OpenAiKeyMissingError();

  // 1. Load VI source
  const source = await loadSource(input.entity_type, input.entity_id);
  if (!source) throw new TranslationSourceNotFoundError();

  // 2. Compute normalized hash + serialized snapshot
  const sourceHash = await computeSourceHash(source.fields);
  const sourceSnapshot = JSON.stringify(source.fields);

  // 3. Acquire locks (duplicate-draft protection per spec §11.1)
  const locks = await acquireDraftLocks(
    input.entity_type,
    input.entity_id,
    input.target_locales,
    sourceHash,
  );
  if (locks.inFlight.length > 0) {
    throw new TranslationInFlightError(locks.inFlight);
  }

  // Collect reused-existing draft rows for the response (no OpenAI call needed).
  const drafts: { id: number; locale: TargetLocale; status: "draft" | "failed" }[] = [];
  const reuseCfg = ENTITY_CONFIG[input.entity_type];
  for (const locale of locks.reusable) {
    const row = await getDb()
      .prepare(
        `SELECT id FROM ${reuseCfg.translationsTable}
          WHERE ${reuseCfg.sourceFkColumn} = ? AND locale = ?`,
      )
      .bind(input.entity_id, locale)
      .first<{ id: number }>();
    if (row) drafts.push({ id: row.id, locale, status: "draft" });
  }

  // If nothing to translate (all reused), skip OpenAI entirely.
  if (locks.toTranslate.length === 0) {
    return {
      drafts,
      reused_existing: locks.reusable,
      tokens_in: 0,
      tokens_out: 0,
      latency_ms: 0,
      estimated_cost_usd: 0,
      log_id: null,
    };
  }

  // 4. Load glossary (longest-first sorted)
  const glossary = await listGlossaryForPrompt();

  // 5. Build prompt
  const promptVersion = input.prompt_version ?? PROMPT_VERSION_V1;
  const model: SupportedModel = input.model ?? defaultModelForEntity(input.entity_type);
  const messages = buildPrompt({
    entityType: input.entity_type,
    sourceFields: source.fields,
    targetLocales: locks.toTranslate,
    glossary,
  });

  // 6. Call OpenAI with JSON recovery (baseUrl defaults to api.openai.com;
  // caller may override with OPENAI_BASE_URL env to route through a proxy
  // such as Cloudflare AI Gateway when direct egress IPs hit geo-blocks)
  const t0 = Date.now();
  const recovery: RecoveryResult = await callOpenAiWithJsonRecovery(
    apiKey,
    model,
    messages,
    baseUrl,
  );
  const latencyMs = Date.now() - t0;

  // 7. Per-locale outcome (spec §4.2 step 7)
  const createdIds: number[] = [];
  for (const locale of locks.toTranslate) {
    let outcome: "draft" | "failed" = "failed";
    let fields: Record<string, string> | null = null;

    if (!recovery.apiError && recovery.parsed) {
      const localeBlock = recovery.parsed[locale];
      if (
        hasAllExpectedFields(localeBlock, source.fields) &&
        passesStructuralChecks(localeBlock, source.fields)
      ) {
        outcome = "draft";
        fields = localeBlock;
      }
    }

    const id = await upsertTranslation({
      entityType: input.entity_type,
      entityId: input.entity_id,
      locale,
      fields,
      status: outcome,
      sourceHash,
      sourceSnapshot,
      aiModel: model,
      promptVersion,
      actorId,
    });
    createdIds.push(id);
    drafts.push({ id, locale, status: outcome });

    // Always clear the lock at the end, even on failed outcome (the row
    // status='failed' is itself the "we tried, it didn't work" signal).
    await clearInFlightLock(input.entity_type, input.entity_id, locale);
  }

  // 8. Log
  const tokensIn = recovery.tokensIn;
  const tokensOut = recovery.tokensOut;
  const cost = computeCostUsd(model, tokensIn, tokensOut);
  const logStatus = recovery.apiError ? "api_error" : recovery.parsed ? "success" : "parse_error";
  const logId = await insertAiTranslationLog({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    target_locales: locks.toTranslate,
    target_translation_ids: createdIds,
    ai_model: model,
    prompt_version: promptVersion,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_usd: cost,
    latency_ms: latencyMs,
    status: logStatus,
    error_message: recovery.apiError?.message ?? null,
    raw_response_json: recovery.rawResponse || null,
    requested_by: actorId,
    source_hash: sourceHash,
  });

  return {
    drafts,
    reused_existing: locks.reusable,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: latencyMs,
    estimated_cost_usd: cost,
    log_id: logId,
  };
}
