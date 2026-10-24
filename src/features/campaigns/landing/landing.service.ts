// Campaign landing uploads — orchestration. Every Worker boundary (D1, R2, AI,
// Telegram, audit log, cache bump) comes in through LandingDeps so the whole
// flow runs in bun:test against real SQLite; landing.server.ts wires the real
// bindings.
//
// Lifecycle of a version:
//   upload   → validate zip, store files + deterministic index.html, row 'processing'
//   process  → AI format (validated edit list or fallback), deterministic checks,
//              AI audit, findings saved, row 'ready', ONE Telegram report to IT
//   publish  → campaigns.landing_version_id = version, landing_path = lp URL
//   rollback → pointer back to the previously published version

import type { LandingReviewPayload } from "@/features/telegram/telegram.events";

import { readLandingBundle } from "./landing.bundle";
import { runAuditStep } from "./landing.audit";
import { runDeterministicChecks } from "./landing.checks";
import { runFormatStep, type JsonAiCall } from "./landing.format";
import { landingObjectKey } from "./landing.host";
import { normalizeLandingHtml } from "./landing.normalize";
import {
  countBySeverity,
  sortFindings,
  type LandingFinding,
  type LandingReport,
} from "./landing.types";

type AuditLogFn = typeof import("@/core/db/mutations").auditLog;

export interface LandingDeps {
  db: D1Database;
  bucket: Pick<R2Bucket, "put" | "get">;
  ai: JsonAiCall | null;
  prompts: { format: string; audit: string };
  auditLog: AuditLogFn;
  bumpCmsRev(): Promise<void>;
  /** Telegram event bus (dispatchEvent). */
  dispatch(input: {
    event_type: "landing_review";
    payload: LandingReviewPayload;
    idempotency_key: string;
  }): Promise<unknown>;
  /** https://lp.thgfulfill.com */
  landingOrigin: string;
  /** https://cms.thgfulfill.com */
  adminOrigin: string;
  newVersionId(): string;
  /** YYYY-MM-DD in Asia/Ho_Chi_Minh. */
  today(): string;
}

export type LandingVersionStatus = "processing" | "ready" | "failed";

export interface LandingVersionRow {
  id: string;
  campaign_id: number;
  slug: string;
  status: LandingVersionStatus;
  original_name: string | null;
  file_count: number;
  total_bytes: number;
  files_json: string;
  report_json: string;
  findings_json: string;
  critical_count: number;
  major_count: number;
  minor_count: number;
  uploaded_by: number | null;
  created_at: number;
  processed_at: number | null;
  last_published_at: number | null;
  last_published_by: number | null;
}

interface CampaignRef {
  id: number;
  slug: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  landing_path: string | null;
  landing_version_id: string | null;
}

const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

const VERSION_COLUMNS = `id, campaign_id, slug, status, original_name, file_count, total_bytes,
  files_json, report_json, findings_json, critical_count, major_count, minor_count, uploaded_by,
  created_at, processed_at, last_published_at, last_published_by`;

async function getCampaignRef(db: D1Database, campaignId: number): Promise<CampaignRef> {
  const row = await db
    .prepare(
      `SELECT id, slug, title, start_date, end_date, landing_path, landing_version_id
         FROM campaigns WHERE id = ? LIMIT 1`,
    )
    .bind(campaignId)
    .first<CampaignRef>();
  if (!row) throw fail(404, "Không tìm thấy Chương trình.");
  return row;
}

export async function getLandingVersion(
  db: D1Database,
  versionId: string,
): Promise<LandingVersionRow | null> {
  return db
    .prepare(`SELECT ${VERSION_COLUMNS} FROM campaign_landing_versions WHERE id = ? LIMIT 1`)
    .bind(versionId)
    .first<LandingVersionRow>();
}

async function requireVersion(db: D1Database, versionId: string): Promise<LandingVersionRow> {
  const row = await getLandingVersion(db, versionId);
  if (!row) throw fail(404, "Không tìm thấy phiên bản landing.");
  return row;
}

export const landingUrl = (deps: Pick<LandingDeps, "landingOrigin">, slug: string) =>
  `${deps.landingOrigin}/${slug}/`;
export const previewUrl = (
  deps: Pick<LandingDeps, "landingOrigin">,
  version: Pick<LandingVersionRow, "id">,
) => `${deps.landingOrigin}/_preview/${version.id}/`;

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
const PUT_BATCH = 8;

// ── Upload ──────────────────────────────────────────────────────────────────

export async function uploadLanding(
  deps: LandingDeps,
  actorId: number,
  input: { campaignId: number; fileName: string; zip: Uint8Array },
): Promise<LandingVersionRow> {
  const campaign = await getCampaignRef(deps.db, input.campaignId);
  const bundle = await readLandingBundle(input.zip);
  const versionId = deps.newVersionId();
  const source = decoder.decode(bundle.files.get("index.html"));
  const normalized = normalizeLandingHtml(source, campaign.slug);

  const writes: [string, Uint8Array, string | null][] = [
    [`landings/${campaign.slug}/${versionId}/source/index.html`, encoder.encode(source), null],
  ];
  for (const [path, data] of bundle.files) {
    const body = path === "index.html" ? encoder.encode(normalized.html) : data;
    writes.push([landingObjectKey(campaign.slug, versionId, path), body, path]);
  }
  for (let i = 0; i < writes.length; i += PUT_BATCH) {
    await Promise.all(
      writes.slice(i, i + PUT_BATCH).map(([key, body]) => deps.bucket.put(key, body)),
    );
  }

  const report: LandingReport = { format: null, audit: null, warnings: bundle.warnings };
  const row = await deps.db
    .prepare(
      `INSERT INTO campaign_landing_versions
         (id, campaign_id, slug, status, original_name, file_count, total_bytes, files_json,
          report_json, uploaded_by)
       VALUES (?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?)
       RETURNING ${VERSION_COLUMNS}`,
    )
    .bind(
      versionId,
      campaign.id,
      campaign.slug,
      input.fileName.slice(0, 200),
      bundle.files.size,
      bundle.totalBytes,
      JSON.stringify([...bundle.files.keys()]),
      JSON.stringify(report),
      actorId,
    )
    .first<LandingVersionRow>();
  if (!row) throw new Error("Không lưu được phiên bản landing.");
  await deps.auditLog(actorId, "create", "campaign_landing_versions", versionId, null, {
    campaign_id: campaign.id,
    slug: campaign.slug,
    file_count: row.file_count,
    total_bytes: row.total_bytes,
    original_name: row.original_name,
  });
  return row;
}

// ── Process (AI format + checks + audit + Telegram) ─────────────────────────

async function readText(deps: LandingDeps, key: string): Promise<string | null> {
  const object = await deps.bucket.get(key);
  return object ? object.text() : null;
}

async function loadStylesheets(
  deps: LandingDeps,
  version: LandingVersionRow,
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const path of paths.filter((p) => p.toLowerCase().endsWith(".css")).slice(0, 20)) {
    const text = await readText(deps, landingObjectKey(version.slug, version.id, path));
    if (text !== null) out.set(path, text);
  }
  return out;
}

async function uploaderName(db: D1Database, userId: number | null): Promise<string | null> {
  if (userId === null) return null;
  const user = await db
    .prepare(`SELECT name, email FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first<{ name: string | null; email: string }>();
  return user ? user.name || user.email : null;
}

async function notifyIt(
  deps: LandingDeps,
  campaign: CampaignRef,
  version: LandingVersionRow,
  findings: LandingFinding[],
  report: LandingReport,
) {
  const counts = countBySeverity(findings);
  try {
    const payload: LandingReviewPayload = {
      campaign_title: campaign.title,
      campaign_slug: campaign.slug,
      version_id: version.id,
      uploader: await uploaderName(deps.db, version.uploaded_by),
      ...counts,
      format_mode: report.format?.mode ?? "deterministic",
      format_note: report.format?.note ?? null,
      audit_mode: report.audit?.mode ?? "rules",
      audit_note: report.audit?.note ?? null,
      top: sortFindings(findings)
        .slice(0, 6)
        .map((f) => ({ severity: f.severity, message: f.message })),
      editor_url: `${deps.adminOrigin}/admin/content/campaigns/${campaign.slug}`,
      preview_url: previewUrl(deps, version),
    };
    // Keyed by version: re-running the checks never sends IT a second message.
    await deps.dispatch({
      event_type: "landing_review",
      payload,
      idempotency_key: `landing_review:${version.id}`,
    });
  } catch (error) {
    // The report is saved on the version either way; Telegram is best-effort.
    console.error(`[landing] landing_review notify failed for ${version.id}`, error);
  }
}

export async function processLanding(
  deps: LandingDeps,
  versionId: string,
): Promise<LandingVersionRow> {
  const version = await requireVersion(deps.db, versionId);
  if (version.status === "failed") throw fail(409, "Phiên bản này đã lỗi — hãy tải lên lại.");
  const campaign = await getCampaignRef(deps.db, version.campaign_id);
  const previous = JSON.parse(version.report_json || "{}") as Partial<LandingReport>;

  try {
    const source = await readText(deps, `landings/${version.slug}/${version.id}/source/index.html`);
    if (source === null) throw new Error("Thiếu index.html gốc trong R2.");
    const paths = JSON.parse(version.files_json) as string[];
    const normalized = normalizeLandingHtml(source, version.slug);

    const formatted = await runFormatStep({
      html: normalized.html,
      lang: normalized.lang,
      prompt: deps.prompts.format,
      ai: deps.ai,
      deterministicNotes: normalized.notes,
    });
    await deps.bucket.put(
      landingObjectKey(version.slug, version.id, "index.html"),
      encoder.encode(formatted.html),
    );

    const ruleFindings = runDeterministicChecks({
      html: formatted.html,
      paths: new Set(paths),
      stylesheets: await loadStylesheets(deps, version, paths),
    });
    const audit = await runAuditStep({
      html: formatted.html,
      prompt: deps.prompts.audit,
      ai: deps.ai,
      context: {
        campaignTitle: campaign.title,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        today: deps.today(),
      },
      ruleFindings,
    });

    const findings = sortFindings([...ruleFindings, ...audit.findings]);
    if (formatted.report.mode === "deterministic" || audit.mode === "rules") {
      const skipped = [formatted.report.note, audit.note].filter(Boolean).join(" ");
      findings.push({
        severity: "minor",
        category: "ai",
        message: "Một phần bước AI đã bị bỏ qua — kết quả chỉ gồm chuẩn hóa và kiểm tra bằng code.",
        evidence: skipped,
        source: "rule",
      });
    }
    const counts = countBySeverity(findings);
    const report: LandingReport = {
      format: formatted.report,
      audit: { mode: audit.mode, note: audit.note },
      warnings: previous.warnings ?? [],
    };
    const updated = await deps.db
      .prepare(
        `UPDATE campaign_landing_versions
            SET status = 'ready', report_json = ?, findings_json = ?, critical_count = ?,
                major_count = ?, minor_count = ?, processed_at = unixepoch()
          WHERE id = ?
          RETURNING ${VERSION_COLUMNS}`,
      )
      .bind(
        JSON.stringify(report),
        JSON.stringify(findings),
        counts.critical,
        counts.major,
        counts.minor,
        version.id,
      )
      .first<LandingVersionRow>();
    if (!updated) throw new Error("Không cập nhật được phiên bản landing.");
    await notifyIt(deps, campaign, updated, findings, report);
    return updated;
  } catch (error) {
    console.error(`[landing] processing failed for ${version.id}`, error);
    const message = error instanceof Error ? error.message : String(error);
    await deps.db
      .prepare(
        `UPDATE campaign_landing_versions SET status = 'failed', report_json = ?, processed_at = unixepoch()
          WHERE id = ?`,
      )
      .bind(JSON.stringify({ ...previous, error: message.slice(0, 500) }), version.id)
      .run();
    throw fail(500, `Xử lý landing thất bại: ${message}`);
  }
}

// ── Publish / rollback ──────────────────────────────────────────────────────

async function pointCampaignAt(
  deps: LandingDeps,
  actorId: number,
  campaign: CampaignRef,
  versionId: string,
  action: "publish" | "rollback",
) {
  const url = landingUrl(deps, campaign.slug);
  await deps.db
    .prepare(
      `UPDATE campaigns SET landing_version_id = ?, landing_path = ?, updated_at = unixepoch(),
              updated_by = ?
        WHERE id = ?`,
    )
    .bind(versionId, url, actorId, campaign.id)
    .run();
  await deps.auditLog(
    actorId,
    action,
    "campaigns",
    campaign.id,
    { landing_version_id: campaign.landing_version_id, landing_path: campaign.landing_path },
    { landing_version_id: versionId, landing_path: url },
  );
  await deps.bumpCmsRev();
  return url;
}

export async function publishLanding(
  deps: LandingDeps,
  actorId: number,
  input: { versionId: string; confirmCritical: boolean },
): Promise<{ landing_path: string; version: LandingVersionRow }> {
  const version = await requireVersion(deps.db, input.versionId);
  if (version.status !== "ready") {
    throw fail(409, "Phiên bản chưa xử lý xong — chưa thể xuất bản.");
  }
  if (version.critical_count > 0 && !input.confirmCritical) {
    throw fail(
      409,
      `Phiên bản có ${version.critical_count} lỗi nghiêm trọng — cần xác nhận "Vẫn xuất bản".`,
    );
  }
  const campaign = await getCampaignRef(deps.db, version.campaign_id);
  await deps.db
    .prepare(
      `UPDATE campaign_landing_versions SET last_published_at = unixepoch(), last_published_by = ?
        WHERE id = ?`,
    )
    .bind(actorId, version.id)
    .run();
  const landing_path = await pointCampaignAt(deps, actorId, campaign, version.id, "publish");
  return { landing_path, version: await requireVersion(deps.db, version.id) };
}

/** Point the campaign back at the version published before the current one. The current
 *  version leaves the publish history, so repeated rollbacks keep stepping back. */
export async function rollbackLanding(
  deps: LandingDeps,
  actorId: number,
  campaignId: number,
): Promise<{ landing_path: string; version_id: string }> {
  const campaign = await getCampaignRef(deps.db, campaignId);
  const current = campaign.landing_version_id;
  if (!current) throw fail(409, "Chương trình chưa xuất bản landing nào.");
  const previous = await deps.db
    .prepare(
      `SELECT id FROM campaign_landing_versions
        WHERE campaign_id = ? AND id != ? AND status = 'ready' AND last_published_at IS NOT NULL
        ORDER BY last_published_at DESC, created_at DESC LIMIT 1`,
    )
    .bind(campaignId, current)
    .first<{ id: string }>();
  if (!previous) throw fail(409, "Không có phiên bản đã xuất bản trước đó để quay lại.");
  await deps.db
    .prepare(
      `UPDATE campaign_landing_versions SET last_published_at = NULL, last_published_by = NULL
        WHERE id = ?`,
    )
    .bind(current)
    .run();
  const landing_path = await pointCampaignAt(deps, actorId, campaign, previous.id, "rollback");
  return { landing_path, version_id: previous.id };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export interface LandingVersionView {
  id: string;
  status: LandingVersionStatus;
  original_name: string | null;
  file_count: number;
  total_bytes: number;
  created_at: number;
  processed_at: number | null;
  uploader: string | null;
  last_published_at: number | null;
  is_live: boolean;
  preview_url: string;
  critical_count: number;
  major_count: number;
  minor_count: number;
  report: LandingReport & { error?: string };
  findings: LandingFinding[];
}

export async function listLandingVersions(
  deps: Pick<LandingDeps, "db" | "landingOrigin">,
  campaignId: number,
): Promise<{
  live_url: string | null;
  live_version_id: string | null;
  versions: LandingVersionView[];
}> {
  const campaign = await getCampaignRef(deps.db, campaignId);
  const result = await deps.db
    .prepare(
      `SELECT v.id, v.campaign_id, v.slug, v.status, v.original_name, v.file_count, v.total_bytes,
              v.files_json, v.report_json, v.findings_json, v.critical_count, v.major_count,
              v.minor_count, v.uploaded_by, v.created_at, v.processed_at, v.last_published_at,
              v.last_published_by, u.name AS uploader_name, u.email AS uploader_email
         FROM campaign_landing_versions v
         LEFT JOIN users u ON u.id = v.uploaded_by
        WHERE v.campaign_id = ?
        ORDER BY v.created_at DESC
        LIMIT 30`,
    )
    .bind(campaignId)
    .all<LandingVersionRow & { uploader_name: string | null; uploader_email: string | null }>();
  const versions = (result.results ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    original_name: row.original_name,
    file_count: row.file_count,
    total_bytes: row.total_bytes,
    created_at: row.created_at,
    processed_at: row.processed_at,
    uploader: row.uploader_name || row.uploader_email,
    last_published_at: row.last_published_at,
    is_live: row.id === campaign.landing_version_id,
    preview_url: previewUrl(deps, row),
    critical_count: row.critical_count,
    major_count: row.major_count,
    minor_count: row.minor_count,
    report: JSON.parse(row.report_json || "{}") as LandingVersionView["report"],
    findings: JSON.parse(row.findings_json || "[]") as LandingFinding[],
  }));
  return {
    live_url: campaign.landing_version_id ? landingUrl(deps, campaign.slug) : null,
    live_version_id: campaign.landing_version_id,
    versions,
  };
}
