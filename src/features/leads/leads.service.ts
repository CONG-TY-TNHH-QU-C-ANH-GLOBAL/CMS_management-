// Leads service — form submissions từ landing page (audit P0.6).

import { getDb } from "@/core/db/client";

export type LeadStatus = "new" | "contacted" | "qualified" | "closed" | "spam";
export type LeadLocale = "en" | "vi" | "zh";

export interface LeadRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  source_page: string | null;
  locale: LeadLocale | null;
  ip: string | null;
  user_agent: string | null;
  utm_json: string | null;
  status: LeadStatus;
  created_at: number;
}

export interface CreateLeadInput {
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  source_page?: string | null;
  locale?: LeadLocale | null;
  ip?: string | null;
  user_agent?: string | null;
  utm?: Record<string, string> | null;
}

export async function createLead(input: CreateLeadInput): Promise<{ id: number }> {
  const utmJson = input.utm ? JSON.stringify(input.utm) : null;
  const row = await getDb()
    .prepare(
      `INSERT INTO leads(name, email, phone, message, source_page, locale, ip, user_agent, utm_json, status, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', unixepoch())
       RETURNING id`,
    )
    .bind(
      input.name.trim(),
      input.email.toLowerCase().trim(),
      input.phone ?? null,
      input.message ?? null,
      input.source_page ?? null,
      input.locale ?? null,
      input.ip ?? null,
      input.user_agent ?? null,
      utmJson,
    )
    .first<{ id: number }>();
  if (!row) throw new Error("Failed to create lead");
  return { id: row.id };
}

export async function listLeads(filter?: { status?: LeadStatus; limit?: number }): Promise<LeadRow[]> {
  const limit = Math.min(filter?.limit ?? 100, 500);
  const sql = filter?.status
    ? `SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM leads ORDER BY created_at DESC LIMIT ?`;
  const stmt = filter?.status
    ? getDb().prepare(sql).bind(filter.status, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<LeadRow>();
  return result.results ?? [];
}

export async function setLeadStatus(id: number, status: LeadStatus): Promise<void> {
  await getDb().prepare(`UPDATE leads SET status = ? WHERE id = ?`).bind(status, id).run();
}
