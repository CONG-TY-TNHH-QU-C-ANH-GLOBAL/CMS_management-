// Careers service — careers_jobs CRUD + applicants.
// Slugs are shared across locales (1 slug × 3 locales).

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type CareerStatus = "open" | "closed" | "archived";
export type CareerLocale = "en" | "vi" | "zh";
export type ApplicantStatus = "new" | "reviewing" | "interview" | "offer" | "rejected" | "archived";

export interface CareersJobRow {
  id: number;
  slug: string;
  locale: CareerLocale;
  title: string;
  body_md: string;
  location: string | null;
  employment_type: string | null;
  status: CareerStatus;
  posted_at: number;
  category: string | null;
  hot: number;
  badge: string | null;
  tagline: string | null;
  salary: string | null;
  salary_unit: string | null;
  salary_note: string | null;
  deadline: string | null;
  experience: string | null;
  lead: string | null;
  responsibilities_json: string | null;
  requirements_json: string | null;
  benefits_json: string | null;
  bonuses_json: string | null;
  position: number;
}

export interface CareersApplicantRow {
  id: number;
  job_slug: string;
  name: string;
  email: string;
  phone: string | null;
  cv_url: string | null;
  cover_letter: string | null;
  locale: CareerLocale;
  status: ApplicantStatus;
  source_page: string | null;
  created_at: number;
}

export async function listCareersJobs(filter?: {
  locale?: CareerLocale;
  status?: CareerStatus;
  category?: string;
}): Promise<CareersJobRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter?.locale) { where.push("locale = ?"); binds.push(filter.locale); }
  if (filter?.status) { where.push("status = ?"); binds.push(filter.status); }
  if (filter?.category) { where.push("category = ?"); binds.push(filter.category); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `SELECT * FROM careers_jobs ${whereClause} ORDER BY position, posted_at DESC`;
  const stmt = binds.length > 0 ? getDb().prepare(sql).bind(...binds) : getDb().prepare(sql);
  const result = await stmt.all<CareersJobRow>();
  return result.results ?? [];
}

export async function getCareersJob(slug: string, locale: CareerLocale): Promise<CareersJobRow | null> {
  const result = await getDb()
    .prepare(`SELECT * FROM careers_jobs WHERE slug = ? AND locale = ? LIMIT 1`)
    .bind(slug, locale)
    .first<CareersJobRow>();
  return result ?? null;
}

// Group jobs by slug — admin list view uses this to show all locale variants in one row.
export async function listCareersJobsGrouped(): Promise<
  Array<{ slug: string; category: string | null; position: number; hot: number; updated_at: number; variants: CareersJobRow[] }>
> {
  const all = await listCareersJobs();
  const map = new Map<string, CareersJobRow[]>();
  for (const j of all) {
    if (!map.has(j.slug)) map.set(j.slug, []);
    map.get(j.slug)!.push(j);
  }
  return Array.from(map.entries()).map(([slug, variants]) => {
    const ref = variants[0];
    return {
      slug,
      category: ref.category,
      position: ref.position,
      hot: ref.hot,
      updated_at: Math.max(...variants.map((v) => v.posted_at)),
      variants,
    };
  }).sort((a, b) => a.position - b.position);
}

// ─────────────────────────────── mutations ───────────────────────────────

export async function upsertCareersJob(
  actorId: number,
  input: {
    slug: string;
    locale: CareerLocale;
    title: string;
    body_md?: string;
    location?: string | null;
    employment_type?: string | null;
    status?: CareerStatus;
    category?: string | null;
    hot?: boolean;
    badge?: string | null;
    tagline?: string | null;
    salary?: string | null;
    salary_unit?: string | null;
    salary_note?: string | null;
    deadline?: string | null;
    experience?: string | null;
    lead?: string | null;
    responsibilities?: Record<string, string[]> | null;
    requirements?: string[] | null;
    benefits?: Array<{ i: string; t: string; d: string }> | null;
    bonuses?: string[] | null;
    position?: number;
  },
): Promise<CareersJobRow> {
  const before = await getCareersJob(input.slug, input.locale);

  const respJson = input.responsibilities !== undefined ? (input.responsibilities ? JSON.stringify(input.responsibilities) : null) : undefined;
  const reqJson = input.requirements !== undefined ? (input.requirements ? JSON.stringify(input.requirements) : null) : undefined;
  const benJson = input.benefits !== undefined ? (input.benefits ? JSON.stringify(input.benefits) : null) : undefined;
  const bonJson = input.bonuses !== undefined ? (input.bonuses ? JSON.stringify(input.bonuses) : null) : undefined;

  if (before) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
    if (input.body_md !== undefined) { fields.push("body_md = ?"); values.push(input.body_md); }
    if (input.location !== undefined) { fields.push("location = ?"); values.push(input.location); }
    if (input.employment_type !== undefined) { fields.push("employment_type = ?"); values.push(input.employment_type); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.category !== undefined) { fields.push("category = ?"); values.push(input.category); }
    if (input.hot !== undefined) { fields.push("hot = ?"); values.push(input.hot ? 1 : 0); }
    if (input.badge !== undefined) { fields.push("badge = ?"); values.push(input.badge); }
    if (input.tagline !== undefined) { fields.push("tagline = ?"); values.push(input.tagline); }
    if (input.salary !== undefined) { fields.push("salary = ?"); values.push(input.salary); }
    if (input.salary_unit !== undefined) { fields.push("salary_unit = ?"); values.push(input.salary_unit); }
    if (input.salary_note !== undefined) { fields.push("salary_note = ?"); values.push(input.salary_note); }
    if (input.deadline !== undefined) { fields.push("deadline = ?"); values.push(input.deadline); }
    if (input.experience !== undefined) { fields.push("experience = ?"); values.push(input.experience); }
    if (input.lead !== undefined) { fields.push("lead = ?"); values.push(input.lead); }
    if (respJson !== undefined) { fields.push("responsibilities_json = ?"); values.push(respJson); }
    if (reqJson !== undefined) { fields.push("requirements_json = ?"); values.push(reqJson); }
    if (benJson !== undefined) { fields.push("benefits_json = ?"); values.push(benJson); }
    if (bonJson !== undefined) { fields.push("bonuses_json = ?"); values.push(bonJson); }
    if (input.position !== undefined) { fields.push("position = ?"); values.push(input.position); }
    if (fields.length > 0) {
      values.push(input.slug, input.locale);
      await getDb().prepare(`UPDATE careers_jobs SET ${fields.join(", ")} WHERE slug = ? AND locale = ?`).bind(...values).run();
    }
  } else {
    await getDb()
      .prepare(
        `INSERT INTO careers_jobs (
            slug, locale, title, body_md, location, employment_type, status, posted_at,
            category, hot, badge, tagline, salary, salary_unit, salary_note, deadline, experience, lead,
            responsibilities_json, requirements_json, benefits_json, bonuses_json, position
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.slug,
        input.locale,
        input.title,
        input.body_md ?? "",
        input.location ?? null,
        input.employment_type ?? null,
        input.status ?? "open",
        input.category ?? null,
        input.hot ? 1 : 0,
        input.badge ?? null,
        input.tagline ?? null,
        input.salary ?? null,
        input.salary_unit ?? null,
        input.salary_note ?? null,
        input.deadline ?? null,
        input.experience ?? null,
        input.lead ?? null,
        respJson ?? null,
        reqJson ?? null,
        benJson ?? null,
        bonJson ?? null,
        input.position ?? 99,
      )
      .run();
  }
  const after = await getCareersJob(input.slug, input.locale);
  await auditLog(actorId, before ? "update" : "create", "careers_jobs", `${input.slug}:${input.locale}`, before, after);
  return after!;
}

export async function deleteCareersJob(actorId: number, slug: string, locale: CareerLocale): Promise<void> {
  const before = await getCareersJob(slug, locale);
  if (!before) return;
  await getDb().prepare(`DELETE FROM careers_jobs WHERE slug = ? AND locale = ?`).bind(slug, locale).run();
  await auditLog(actorId, "delete", "careers_jobs", `${slug}:${locale}`, before, null);
}

export async function deleteCareersJobSlug(actorId: number, slug: string): Promise<void> {
  const all = await listCareersJobs();
  const variants = all.filter((j) => j.slug === slug);
  if (variants.length === 0) return;
  await getDb().prepare(`DELETE FROM careers_jobs WHERE slug = ?`).bind(slug).run();
  await auditLog(actorId, "delete", "careers_jobs", slug, variants, null);
}

// ─────────────────────────────── applicants ───────────────────────────────

export async function listApplicants(filter?: {
  job_slug?: string;
  status?: ApplicantStatus;
  limit?: number;
}): Promise<CareersApplicantRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter?.job_slug) { where.push("job_slug = ?"); binds.push(filter.job_slug); }
  if (filter?.status) { where.push("status = ?"); binds.push(filter.status); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = filter?.limit ?? 100;
  const sql = `SELECT id, job_slug, name, email, phone, cv_url, cover_letter, locale, status, source_page, created_at
                 FROM careers_applicants ${whereClause} ORDER BY created_at DESC LIMIT ?`;
  const stmt = binds.length > 0
    ? getDb().prepare(sql).bind(...binds, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<CareersApplicantRow>();
  return result.results ?? [];
}

export async function createApplicant(input: {
  job_slug: string;
  name: string;
  email: string;
  phone?: string | null;
  cv_url?: string | null;
  cover_letter?: string | null;
  locale: CareerLocale;
  source_page?: string | null;
  utm?: Record<string, string>;
  ip?: string | null;
  user_agent?: string | null;
}): Promise<{ id: number }> {
  const inserted = await getDb()
    .prepare(
      `INSERT INTO careers_applicants (job_slug, name, email, phone, cv_url, cover_letter, locale, source_page, utm_json, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      input.job_slug,
      input.name,
      input.email,
      input.phone ?? null,
      input.cv_url ?? null,
      input.cover_letter ?? null,
      input.locale,
      input.source_page ?? null,
      input.utm ? JSON.stringify(input.utm) : null,
      input.ip ?? null,
      input.user_agent ?? null,
    )
    .first<{ id: number }>();
  if (!inserted) throw new Error("Không tạo được applicant.");
  return inserted;
}

export async function updateApplicantStatus(
  actorId: number,
  input: { id: number; status: ApplicantStatus },
): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT id, status FROM careers_applicants WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<{ id: number; status: ApplicantStatus }>();
  if (!before) throw Object.assign(new Error("Applicant không tồn tại."), { statusCode: 404 });
  await getDb().prepare(`UPDATE careers_applicants SET status = ? WHERE id = ?`).bind(input.status, input.id).run();
  await auditLog(actorId, "update", "careers_applicants", input.id, before, { id: input.id, status: input.status });
}

export async function deleteApplicant(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT * FROM careers_applicants WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<CareersApplicantRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM careers_applicants WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "careers_applicants", id, before, null);
}
