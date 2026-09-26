// Leads service — form submissions từ landing page (audit P0.6).

import { getDb } from "@/core/db/client";

export type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
export type LeadLocale = "en" | "vi" | "zh";

export interface LeadRow {
  id: number;
  name: string;
  email: string;
  company_url: string | null;
  monthly_order_band: string | null;
  ship_to_markets_json: string | null;
  phone: string | null;
  message: string | null;
  source_page: string | null;
  locale: LeadLocale | null;
  ip: string | null;
  user_agent: string | null;
  utm_json: string | null;
  // Multi-intent columns (migration 0041); NULL for legacy/unclassified leads.
  primary_service: string | null;
  surface: string | null;
  service_interests_json: string | null;
  service_details_json: string | null;
  crm_projection: "lead" | "consultation";
  visitor_country: string | null;
  visitor_region: string | null;
  visitor_city: string | null;
  visitor_timezone: string | null;
  status: string;
  pipeline_status: LeadStatus;
  lost_reason: string | null;
  first_response_at: number | null;
  status_updated_at: number;
  created_at: number;
}

export interface CreateLeadInput {
  name: string;
  email: string;
  company_url?: string | null;
  monthly_order_band?: string | null;
  ship_to_markets?: string[] | null;
  phone?: string | null;
  message?: string | null;
  source_page?: string | null;
  locale?: LeadLocale | null;
  ip?: string | null;
  user_agent?: string | null;
  utm?: Record<string, string> | null;
  // Multi-intent fields owned by lead-request.ts. Absent (null/empty) for legacy submissions.
  primary_service?: string | null;
  surface?: string | null;
  service_interests?: string[] | null;
  service_details?: Record<string, unknown> | null;
  crm_projection?: "lead" | "consultation";
  visitor_location?: {
    country?: string | null;
    region?: string | null;
    city?: string | null;
    timezone?: string | null;
  } | null;
}

export async function createLead(input: CreateLeadInput): Promise<{ id: number }> {
  const utmJson = input.utm ? JSON.stringify(input.utm) : null;
  const interestsJson =
    input.service_interests && input.service_interests.length > 0
      ? JSON.stringify(input.service_interests)
      : null;
  const detailsJson = input.service_details ? JSON.stringify(input.service_details) : null;
  const marketsJson = input.ship_to_markets?.length ? JSON.stringify(input.ship_to_markets) : null;
  const row = await getDb()
    .prepare(
      `INSERT INTO leads(name, email, company_url, monthly_order_band, ship_to_markets_json, phone, message, source_page, locale, ip, user_agent, utm_json, primary_service, surface, service_interests_json, service_details_json, crm_projection, visitor_country, visitor_region, visitor_city, visitor_timezone, status, pipeline_status, created_at, status_updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'new', unixepoch(), unixepoch())
       RETURNING id`,
    )
    .bind(
      input.name.trim(),
      input.email.toLowerCase().trim(),
      input.company_url ?? null,
      input.monthly_order_band ?? null,
      marketsJson,
      input.phone ?? null,
      input.message ?? null,
      input.source_page ?? null,
      input.locale ?? null,
      input.ip ?? null,
      input.user_agent ?? null,
      utmJson,
      input.primary_service ?? null,
      input.surface ?? null,
      interestsJson,
      detailsJson,
      input.crm_projection ?? "lead",
      input.visitor_location?.country ?? null,
      input.visitor_location?.region ?? null,
      input.visitor_location?.city ?? null,
      input.visitor_location?.timezone ?? null,
    )
    .first<{ id: number }>();
  if (!row) throw new Error("Failed to create lead");
  return { id: row.id };
}

export async function listLeads(filter?: {
  status?: LeadStatus;
  limit?: number;
}): Promise<LeadRow[]> {
  const limit = Math.min(filter?.limit ?? 100, 500);
  const sql = filter?.status
    ? `SELECT * FROM leads WHERE pipeline_status = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM leads ORDER BY created_at DESC LIMIT ?`;
  const stmt = filter?.status
    ? getDb().prepare(sql).bind(filter.status, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<LeadRow>();
  return result.results ?? [];
}

export async function setLeadStatus(id: number, status: LeadStatus, lostReason?: string | null): Promise<void> {
  const legacyStatus = status === "proposal" || status === "won" || status === "lost" ? "closed" : status;
  await getDb()
    .prepare(
      `UPDATE leads
       SET pipeline_status = ?, status = ?, lost_reason = ?,
           first_response_at = CASE
             WHEN first_response_at IS NULL AND ? <> 'new' THEN unixepoch()
             ELSE first_response_at
           END,
           status_updated_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(status, legacyStatus, status === "lost" ? (lostReason ?? null) : null, status, id)
    .run();
}
