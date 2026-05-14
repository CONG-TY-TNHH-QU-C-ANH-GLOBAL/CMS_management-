// AI translation log — append-only write + analytics read.
// Stores: tokens, cost (frozen at write), latency, status, raw response.
// See spec §3.1 (ai_translation_log) + §11.5 (prompt drift analytics).

import { getDb } from "@/core/db/client";

export type AiTranslationLogStatus = "success" | "parse_error" | "api_error" | "timeout";

export interface AiTranslationLogRow {
  id: number;
  entity_type: string;
  entity_id: number;
  target_locales: string; // JSON array
  target_translation_ids: string; // JSON array of integers
  ai_model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
  latency_ms: number;
  status: AiTranslationLogStatus;
  error_message: string | null;
  raw_response_json: string | null;
  requested_by: number;
  source_hash: string;
  created_at: number;
}

export interface InsertAiTranslationLogInput {
  entity_type: string;
  entity_id: number;
  target_locales: string[];
  target_translation_ids: number[];
  ai_model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
  latency_ms: number;
  status: AiTranslationLogStatus;
  error_message: string | null;
  raw_response_json: string | null;
  requested_by: number;
  source_hash: string;
}

export async function insertAiTranslationLog(input: InsertAiTranslationLogInput): Promise<number> {
  const result = await getDb()
    .prepare(
      `INSERT INTO ai_translation_log (
         entity_type, entity_id, target_locales, target_translation_ids,
         ai_model, prompt_version, tokens_in, tokens_out, estimated_cost_usd,
         latency_ms, status, error_message, raw_response_json,
         requested_by, source_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      input.entity_type,
      input.entity_id,
      JSON.stringify(input.target_locales),
      JSON.stringify(input.target_translation_ids),
      input.ai_model,
      input.prompt_version,
      input.tokens_in,
      input.tokens_out,
      input.estimated_cost_usd,
      input.latency_ms,
      input.status,
      input.error_message,
      input.raw_response_json,
      input.requested_by,
      input.source_hash,
    )
    .first<{ id: number }>();
  if (!result) throw new Error("Failed to insert ai_translation_log row");
  return result.id;
}

/** Read recent log rows for one entity (audit drill-down in admin UI). */
export async function listAiTranslationLogsForEntity(
  entity_type: string,
  entity_id: number,
  limit = 20,
): Promise<AiTranslationLogRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, entity_type, entity_id, target_locales, target_translation_ids,
              ai_model, prompt_version, tokens_in, tokens_out, estimated_cost_usd,
              latency_ms, status, error_message, raw_response_json,
              requested_by, source_hash, created_at
         FROM ai_translation_log
        WHERE entity_type = ? AND entity_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .bind(entity_type, entity_id, Math.max(1, Math.min(200, limit)))
    .all<AiTranslationLogRow>();
  return result.results ?? [];
}

/** Aggregate cost/tokens for a date range (cost dashboard, Phase 6+). */
export interface AiTranslationLogSummary {
  total_calls: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  success_count: number;
  parse_error_count: number;
  api_error_count: number;
  timeout_count: number;
}

export async function summarizeAiTranslationLog(since: number): Promise<AiTranslationLogSummary> {
  const row = await getDb()
    .prepare(
      `SELECT
          COUNT(*) AS total_calls,
          COALESCE(SUM(tokens_in), 0) AS total_tokens_in,
          COALESCE(SUM(tokens_out), 0) AS total_tokens_out,
          COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN status = 'parse_error' THEN 1 ELSE 0 END) AS parse_error_count,
          SUM(CASE WHEN status = 'api_error' THEN 1 ELSE 0 END) AS api_error_count,
          SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) AS timeout_count
         FROM ai_translation_log
        WHERE created_at >= ?`,
    )
    .bind(since)
    .first<AiTranslationLogSummary>();
  return (
    row ?? {
      total_calls: 0,
      total_tokens_in: 0,
      total_tokens_out: 0,
      total_cost_usd: 0,
      success_count: 0,
      parse_error_count: 0,
      api_error_count: 0,
      timeout_count: 0,
    }
  );
}
