// Monthly "Top sản phẩm & nguồn hàng" content.  Unlike campaigns, this is a
// fixed PDF template: one administrated year owns twelve independent months.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";
import { toMediaUrl } from "@/features/partners/partners.media";

import { isMonthlySourcingIdentity, monthlySourcingSlug } from "./monthly-sourcing.pure";
import { monthlySourcingPdfProblem } from "./monthly-sourcing.validation";

export type MonthlySourcingStatus = "draft" | "live" | "archived";

export interface MonthlySourcingYearRow {
  id: number;
  year: number;
  title: string;
  status: MonthlySourcingStatus;
  nav_active: number;
  created_at: number;
  updated_at: number;
  updated_by: number | null;
}

export interface MonthlySourcingMonthRow {
  id: number;
  year_id: number;
  month: number;
  title: string;
  pdf_media_id: number | null;
  status: MonthlySourcingStatus;
  updated_at: number;
  updated_by: number | null;
}

export interface MonthlySourcingAdminMonthRow extends MonthlySourcingMonthRow {
  pdf_r2_key: string | null;
  pdf_mime: string | null;
  pdf_media_status: string | null;
  pdf_monthly_pdf_verified: number | null;
}

export interface MonthlySourcingAdminYear extends MonthlySourcingYearRow {
  months: MonthlySourcingAdminMonthRow[];
}

export interface PublicMonthlySourcingMonth {
  month: number;
  title: string;
  slug: string;
}

export interface PublicMonthlySourcing {
  year: number | null;
  months: PublicMonthlySourcingMonth[];
}

interface LandingMonthlySourcingRow {
  year: number;
  month: number;
  title: string;
  r2_key: string;
}

export interface LiveMonthlySourcingForLanding {
  year: number;
  month: number;
  title: string;
  pdfUrl: string;
}

export interface UpdateMonthlySourcingMonthInput {
  id: number;
  title?: string;
  pdf_media_id?: number | null;
  status?: MonthlySourcingStatus;
}

const YEAR_COLUMNS = "id, year, title, status, nav_active, created_at, updated_at, updated_by";
const MONTH_COLUMNS = "id, year_id, month, title, pdf_media_id, status, updated_at, updated_by";

function defaultMonthTitle(year: number, month: number): string {
  return `Top sản phẩm & nguồn hàng tháng ${month}/${year}`;
}

function notFound(subject: "year" | "month"): Error {
  return Object.assign(
    new Error(
      subject === "year" ? "Không tìm thấy năm nguồn hàng." : "Không tìm thấy tháng nguồn hàng.",
    ),
    { statusCode: 404 },
  );
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function invalidPdf(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 422 });
}

async function getYearById(id: number): Promise<MonthlySourcingYearRow | null> {
  return getDb()
    .prepare(`SELECT ${YEAR_COLUMNS} FROM monthly_sourcing_years WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<MonthlySourcingYearRow>();
}

async function getMonthById(id: number): Promise<MonthlySourcingMonthRow | null> {
  return getDb()
    .prepare(`SELECT ${MONTH_COLUMNS} FROM monthly_sourcing_months WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<MonthlySourcingMonthRow>();
}

async function assertPublishablePdf(pdfMediaId: number | null): Promise<void> {
  if (pdfMediaId === null) {
    throw invalidPdf(monthlySourcingPdfProblem(null)!);
  }
  const media = await getDb()
    .prepare("SELECT mime, status, monthly_pdf_verified FROM media WHERE id = ? LIMIT 1")
    .bind(pdfMediaId)
    .first<{ mime: string; status: string; monthly_pdf_verified: number }>();
  const problem = monthlySourcingPdfProblem(media ?? null);
  if (problem) throw invalidPdf(problem);
}

/** Campaign LPs and monthly PDFs share the root of lp.thgfulfill.com.  Years
 * are therefore created only when every one of their twelve stable paths is
 * free, preserving any campaign that predates the reserved monthly namespace. */
async function campaignSlugCollision(year: number): Promise<string | null> {
  const slugs = Array.from({ length: 12 }, (_, index) => monthlySourcingSlug(year, index + 1));
  const row = await getDb()
    .prepare(
      `SELECT slug FROM campaigns
        WHERE locale = 'vi' AND slug IN (${slugs.map(() => "?").join(", ")})
        LIMIT 1`,
    )
    .bind(...slugs)
    .first<{ slug: string }>();
  return row?.slug ?? null;
}

// ── Admin reads ─────────────────────────────────────────────────────────────

export async function listMonthlySourcingAdmin(): Promise<MonthlySourcingAdminYear[]> {
  const db = getDb();
  const [yearsResult, monthsResult] = await Promise.all([
    db
      .prepare(`SELECT ${YEAR_COLUMNS} FROM monthly_sourcing_years ORDER BY year DESC`)
      .all<MonthlySourcingYearRow>(),
    db
      .prepare(
        `SELECT ms.${MONTH_COLUMNS.replaceAll(", ", ", ms.")},
                media.r2_key AS pdf_r2_key, media.mime AS pdf_mime, media.status AS pdf_media_status,
                media.monthly_pdf_verified AS pdf_monthly_pdf_verified
           FROM monthly_sourcing_months ms
           LEFT JOIN media ON media.id = ms.pdf_media_id
          ORDER BY ms.year_id, ms.month`,
      )
      .all<MonthlySourcingAdminMonthRow>(),
  ]);
  const monthsByYear = new Map<number, MonthlySourcingAdminMonthRow[]>();
  for (const month of monthsResult.results ?? []) {
    const rows = monthsByYear.get(month.year_id) ?? [];
    rows.push(month);
    monthsByYear.set(month.year_id, rows);
  }
  return (yearsResult.results ?? []).map((year) => ({
    ...year,
    months: monthsByYear.get(year.id) ?? [],
  }));
}

// ── Admin writes ────────────────────────────────────────────────────────────

/** Creates all twelve blank slots up-front so the operator only uploads a PDF
 *  to the intended month; a partially-created year is never exposed as live. */
export async function createMonthlySourcingYear(
  actorId: number,
  year: number,
): Promise<MonthlySourcingYearRow> {
  const collision = await campaignSlugCollision(year);
  if (collision) {
    throw conflict(`Đường dẫn ${collision} đang được một Chương trình sử dụng.`);
  }
  const existing = await getDb()
    .prepare("SELECT id FROM monthly_sourcing_years WHERE year = ? LIMIT 1")
    .bind(year)
    .first<{ id: number }>();
  if (existing) throw conflict(`Năm ${year} đã tồn tại.`);

  const inserted = await getDb()
    .prepare(
      `INSERT INTO monthly_sourcing_years (year, updated_by)
       VALUES (?, ?)
       RETURNING ${YEAR_COLUMNS}`,
    )
    .bind(year, actorId)
    .first<MonthlySourcingYearRow>();
  if (!inserted) throw new Error("Không tạo được năm nguồn hàng.");

  try {
    await getDb().batch(
      Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return getDb()
          .prepare(
            `INSERT INTO monthly_sourcing_months (year_id, month, title, updated_by)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(inserted.id, month, defaultMonthTitle(year, month), actorId);
      }),
    );
  } catch (error) {
    // D1 has no transaction spanning the returned parent id and its child
    // inserts.  Clean up the parent before surfacing a failed creation.
    await getDb()
      .prepare("DELETE FROM monthly_sourcing_years WHERE id = ?")
      .bind(inserted.id)
      .run();
    throw error;
  }

  await auditLog(actorId, "create", "monthly_sourcing_years", inserted.id, null, inserted);
  return inserted;
}

/** Makes this year the only navbar year and publishes the year container.
 *  Its months still remain individual draft/live records. */
export async function activateMonthlySourcingYear(
  actorId: number,
  id: number,
): Promise<MonthlySourcingYearRow> {
  const before = await getYearById(id);
  if (!before) throw notFound("year");
  const db = getDb();
  await db.batch([
    db
      .prepare(
        `UPDATE monthly_sourcing_years
            SET nav_active = 0, updated_at = unixepoch(), updated_by = ?
          WHERE nav_active = 1 AND id != ?`,
      )
      .bind(actorId, id),
    db
      .prepare(
        `UPDATE monthly_sourcing_years
            SET status = 'live', nav_active = 1, updated_at = unixepoch(), updated_by = ?
          WHERE id = ?`,
      )
      .bind(actorId, id),
  ]);
  const after = await getYearById(id);
  if (!after) throw notFound("year");
  await auditLog(actorId, "publish", "monthly_sourcing_years", id, before, after);
  return after;
}

export async function updateMonthlySourcingMonth(
  actorId: number,
  input: UpdateMonthlySourcingMonthInput,
): Promise<MonthlySourcingMonthRow> {
  const before = await getMonthById(input.id);
  if (!before) throw notFound("month");

  const nextStatus = input.status ?? before.status;
  const nextPdfMediaId =
    input.pdf_media_id === undefined ? before.pdf_media_id : input.pdf_media_id;
  if (nextStatus === "live") await assertPublishablePdf(nextPdfMediaId);

  const columns: Array<keyof Omit<UpdateMonthlySourcingMonthInput, "id">> = [];
  if (input.title !== undefined) columns.push("title");
  if (input.pdf_media_id !== undefined) columns.push("pdf_media_id");
  if (input.status !== undefined) columns.push("status");
  if (columns.length === 0) return before;

  const after = await getDb()
    .prepare(
      `UPDATE monthly_sourcing_months
          SET ${columns.map((column) => `${column} = ?`).join(", ")},
              updated_at = unixepoch(), updated_by = ?
        WHERE id = ?
        RETURNING ${MONTH_COLUMNS}`,
    )
    .bind(...columns.map((column) => input[column]), actorId, input.id)
    .first<MonthlySourcingMonthRow>();
  if (!after) throw notFound("month");
  await auditLog(actorId, "update", "monthly_sourcing_months", input.id, before, after);
  return after;
}

// ── Public reads ────────────────────────────────────────────────────────────

/** The navbar needs one selected year and only months whose ready PDFs are
 *  already live.  Old years remain live but are not returned here once a newer
 *  year is activated. */
export async function getActiveLiveMonthlySourcing(): Promise<PublicMonthlySourcing> {
  const year = await getDb()
    .prepare(
      `SELECT id, year
         FROM monthly_sourcing_years
        WHERE nav_active = 1 AND status = 'live'
        LIMIT 1`,
    )
    .first<{ id: number; year: number }>();
  if (!year) return { year: null, months: [] };

  const result = await getDb()
    .prepare(
      `SELECT ms.month, ms.title
         FROM monthly_sourcing_months ms
         JOIN media ON media.id = ms.pdf_media_id
        WHERE ms.year_id = ?
          AND ms.status = 'live'
          AND media.status = 'ready'
          AND media.mime = 'application/pdf'
          AND media.monthly_pdf_verified = 1
        ORDER BY ms.month`,
    )
    .bind(year.id)
    .all<Pick<MonthlySourcingMonthRow, "month" | "title">>();
  return {
    year: year.year,
    months: (result.results ?? []).map((month) => ({
      ...month,
      slug: monthlySourcingSlug(year.year, month.month),
    })),
  };
}

/** Read used by the isolated lp.thgfulfill.com host.  `origin` MUST be the
 * CMS public origin (for example env.BASE_URL), not the LP request origin,
 * because the PDF byte proxy is intentionally unavailable on the LP host. */
export async function getLiveMonthlySourcingForLanding(
  year: number,
  month: number,
  origin: string,
  db: D1Database = getDb(),
): Promise<LiveMonthlySourcingForLanding | null> {
  if (!isMonthlySourcingIdentity({ year, month })) return null;
  const row = await db
    .prepare(
      `SELECT sy.year, ms.month, ms.title, media.r2_key
         FROM monthly_sourcing_years sy
         JOIN monthly_sourcing_months ms ON ms.year_id = sy.id
         JOIN media ON media.id = ms.pdf_media_id
        WHERE sy.year = ?
          AND sy.status = 'live'
          AND ms.month = ?
          AND ms.status = 'live'
          AND media.status = 'ready'
          AND media.mime = 'application/pdf'
          AND media.monthly_pdf_verified = 1
        LIMIT 1`,
    )
    .bind(year, month)
    .first<LandingMonthlySourcingRow>();
  const pdfUrl = row ? toMediaUrl(row.r2_key, origin) : null;
  return row && pdfUrl ? { year: row.year, month: row.month, title: row.title, pdfUrl } : null;
}
