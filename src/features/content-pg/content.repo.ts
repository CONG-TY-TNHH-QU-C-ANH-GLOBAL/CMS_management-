// Repository for the service-content data plane. Enforces the kind registry BEFORE persistence and
// relies on the DB for business identity (UNIQUE(page_id, kind, block_key)) and referential integrity.
// Revisions are append-only; publishing is an explicit, atomic pointer move (reviewed != published).
import { ContentError, PG_UNIQUE_VIOLATION } from "./content.errors";
import { validateCoreConfig, validateRevision, type Kind } from "./content.kinds";
import type { PgExec } from "./pg-adapter";

export interface LocaleSeed {
  code: string;
  nativeName: string;
  isActive: boolean;
  isSource: boolean;
}

export interface NewBlock {
  pageId: number;
  kind: Kind;
  blockKey: string;
  position: number;
  icon?: string | null;
  coreConfig?: Record<string, unknown>;
}

export interface NewRevision {
  localizationId: number;
  title?: string | null;
  description?: string | null;
  translatedPayload?: Record<string, unknown>;
  sourceLocale?: string | null;
  sourceHash?: string;
  createdBy?: number | null;
  // NOTE: review status is NOT a caller field. Drafts are always created as 'draft' via
  // content.create_draft_revision; a 'reviewed' revision exists only via content.approve_revision.
}

export interface PublishedBlockRow {
  id: number;
  block_key: string;
  kind: string;
  position: number;
  icon: string | null;
  core_config: Record<string, unknown>;
  title: string | null;
  description: string | null;
  translated_payload: Record<string, unknown>;
}

/** Map a raw driver error to a bounded ContentError (never leak SQL/driver internals). */
function mapDbError(err: unknown): ContentError {
  const code = (err as { code?: string })?.code;
  const msg = err instanceof Error ? err.message : String(err);
  // Optimistic-concurrency signals (publish pointer moved / approve block-version moved / a draft that
  // was already approved) → conflict. Checked BEFORE the generic unique rule so the double-approve
  // unique violation (uq_reviewed_from) is not misreported as a duplicate block identity.
  if (code === "40001" || /pointer moved|version moved/.test(msg) || /uq_reviewed_from/.test(msg)) {
    return new ContentError("conflict", "content changed concurrently; retry with current state");
  }
  if (code === PG_UNIQUE_VIOLATION || /unique|duplicate key/i.test(msg)) {
    return new ContentError(
      "duplicate_identity",
      "a block with this (page, kind, block_key) already exists",
    );
  }
  // Workflow guards from the DB functions (non-reviewed publish, non-draft approve, cross-localization,
  // missing row) → not_publishable.
  if (/publish rejected|approve rejected|draft rejected/.test(msg)) {
    return new ContentError("not_publishable", "revision is not eligible for this operation");
  }
  return new ContentError("db_unavailable", "content store write failed");
}

export async function upsertLocale(exec: PgExec, l: LocaleSeed): Promise<void> {
  await exec.query(
    `INSERT INTO content_locales (code, native_name, is_active, is_source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (code) DO UPDATE SET native_name = EXCLUDED.native_name,
       is_active = EXCLUDED.is_active, is_source = EXCLUDED.is_source`,
    [l.code, l.nativeName, l.isActive, l.isSource],
  );
}

export async function createPage(exec: PgExec, slug: string): Promise<number> {
  const rows = await exec.query<{ id: number }>(
    `INSERT INTO service_content_pages (slug) VALUES ($1)
     ON CONFLICT (slug) DO UPDATE SET updated_at = now() RETURNING id`,
    [slug],
  );
  return rows[0].id;
}

export async function createBlock(exec: PgExec, b: NewBlock): Promise<number> {
  validateCoreConfig(b.kind, b.coreConfig ?? {});
  try {
    const rows = await exec.query<{ id: number }>(
      `INSERT INTO service_content_blocks (page_id, kind, block_key, position, icon, core_config)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [
        b.pageId,
        b.kind,
        b.blockKey,
        b.position,
        b.icon ?? null,
        JSON.stringify(b.coreConfig ?? {}),
      ],
    );
    return rows[0].id;
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function upsertLocalization(
  exec: PgExec,
  blockId: number,
  locale: string,
): Promise<number> {
  const rows = await exec.query<{ id: number }>(
    `INSERT INTO service_content_localizations (block_id, locale) VALUES ($1, $2)
     ON CONFLICT (block_id, locale) DO UPDATE SET locale = EXCLUDED.locale RETURNING id`,
    [blockId, locale],
  );
  return rows[0].id;
}

/** Create a new immutable DRAFT revision via content.create_draft_revision (status forced to 'draft').
 *  Validated by the block's kind BEFORE the DB call. Does NOT change what is published, and cannot
 *  create a reviewed revision — the runtime has no direct revision INSERT. */
export async function createDraftRevision(exec: PgExec, kind: Kind, r: NewRevision): Promise<number> {
  validateRevision(kind, {
    title: r.title ?? null,
    description: r.description ?? null,
    translatedPayload: r.translatedPayload ?? {},
  });
  try {
    const rows = await exec.query<{ create_draft_revision: number }>(
      "SELECT content.create_draft_revision($1, $2, $3, $4::jsonb, $5, $6, $7) AS create_draft_revision",
      [
        r.localizationId,
        r.title ?? null,
        r.description ?? null,
        JSON.stringify(r.translatedPayload ?? {}),
        r.sourceLocale ?? null,
        r.sourceHash ?? "",
        r.createdBy ?? null,
      ],
    );
    return rows[0].create_draft_revision;
  } catch (err) {
    throw mapDbError(err);
  }
}

/** Approve an EXACT draft via content.approve_revision → a new immutable 'reviewed' revision that
 *  copies the draft's content verbatim and records reviewed_from_revision_id/reviewer. The caller
 *  supplies no content. Optional expectedVersion guards the owning block's optimistic version. */
export async function approveRevision(
  exec: PgExec,
  draftRevisionId: number,
  reviewerId?: number,
  expectedVersion?: number,
): Promise<number> {
  try {
    const rows = await exec.query<{ approve_revision: number }>(
      "SELECT content.approve_revision($1, $2, $3) AS approve_revision",
      [draftRevisionId, reviewerId ?? null, expectedVersion ?? null],
    );
    return rows[0].approve_revision;
  } catch (err) {
    throw mapDbError(err);
  }
}

/** Atomically move the published pointer for a localization to a specific revision. */
/** Move the published pointer via the DB function content.publish_revision — the ONLY publication path.
 *  The runtime role has no direct write on the publication table, only EXECUTE on this function, which
 *  enforces ownership + review_status='reviewed' + optional optimistic concurrency in the DB. Passing
 *  expectedRevisionId guards against a lost update (the pointer must still hold that revision). */
export async function publish(
  exec: PgExec,
  localizationId: number,
  revisionId: number,
  expectedRevisionId?: number,
): Promise<void> {
  try {
    await exec.query("SELECT content.publish_revision($1, $2, $3, $4)", [
      localizationId,
      revisionId,
      null,
      expectedRevisionId ?? null,
    ]);
  } catch (err) {
    throw mapDbError(err);
  }
}

/** Published, locale-resolved blocks for a page — active blocks whose requested locale has a published
 *  revision. No cross-locale fallback: a missing locale simply omits the block. Deterministic order. */
export async function getPublishedBlocks(
  exec: PgExec,
  pageSlug: string,
  locale: string,
): Promise<PublishedBlockRow[]> {
  return exec.query<PublishedBlockRow>(
    `SELECT b.id, b.block_key, b.kind, b.position, b.icon, b.core_config,
            r.title, r.description, r.translated_payload
       FROM service_content_pages p
       JOIN service_content_blocks b ON b.page_id = p.id AND b.is_active = true
       JOIN service_content_localizations l ON l.block_id = b.id AND l.locale = $2
       JOIN service_content_publications pub ON pub.localization_id = l.id
       JOIN service_content_revisions r ON r.id = pub.revision_id
      WHERE p.slug = $1
      ORDER BY b.kind, b.position, b.id`,
    [pageSlug, locale],
  );
}
