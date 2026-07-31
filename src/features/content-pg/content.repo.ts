// Repository for the service-content data plane. Enforces the kind registry BEFORE persistence and
// relies on the DB for business identity (UNIQUE(page_id, kind, block_key)) and referential integrity.
// Revisions are append-only; publishing is an explicit, atomic pointer move (reviewed != published).
import {
  ContentError,
  PG_UNIQUE_VIOLATION,
  PG_SERIALIZATION_FAILURE,
  PG_CONTENT_NOT_ELIGIBLE,
  PG_CONTENT_CONFLICT,
} from "./content.errors";
import { validateCoreConfig, validateRevision, type Kind } from "./content.kinds";
import type { PgExec } from "./pg-adapter";

export interface LocaleSeed {
  code: string;
  nativeName: string;
  isActive: boolean;
  isSource: boolean;
  /** locale_rollout enum value; defaults to 'planned' (not publicly served) when omitted. */
  rolloutStatus?: "planned" | "preview" | "public" | "retired";
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

/** The violated constraint/index name, from the driver's structured metadata (never the message text).
 *  postgres.js exposes `constraint_name`; PGlite exposes `constraint`. */
function constraintName(err: unknown): string | undefined {
  const e = err as { constraint_name?: string; constraint?: string } | null;
  return e?.constraint_name ?? e?.constraint;
}

/** Map a raw driver error to a bounded ContentError using SQLSTATE + constraint metadata ONLY — no
 *  message parsing (message text is localizable and must never drive control flow), and never leaking
 *  SQL/driver internals. */
function mapDbError(err: unknown): ContentError {
  const code = (err as { code?: string })?.code;
  const constraint = constraintName(err);
  // Application eligibility errors raised by the DB functions carry the custom SQLSTATE 'PT001'.
  if (code === PG_CONTENT_NOT_ELIGIBLE) {
    return new ContentError("not_publishable", "revision is not eligible for this operation");
  }
  // Workflow conflict (PT409, e.g. a draft already approved) or an optimistic serialization failure
  // (pointer/version moved). The double-approve unique index is mapped inside the DB function to PT409;
  // the constraint check remains as defense-in-depth.
  if (
    code === PG_CONTENT_CONFLICT ||
    code === PG_SERIALIZATION_FAILURE ||
    constraint === "uq_reviewed_from"
  ) {
    return new ContentError("conflict", "content changed concurrently; retry with current state");
  }
  if (code === PG_UNIQUE_VIOLATION) {
    if (constraint === "uq_block_identity") {
      return new ContentError(
        "duplicate_identity",
        "a block with this (page, kind, block_key) already exists",
      );
    }
    return new ContentError("conflict", "a uniqueness constraint was violated");
  }
  return new ContentError("db_unavailable", "content store write failed");
}

export async function upsertLocale(exec: PgExec, l: LocaleSeed): Promise<void> {
  try {
    await exec.query(
      `INSERT INTO content.content_locales (code, native_name, is_active, is_source, rollout_status)
       VALUES ($1, $2, $3, $4, $5::content.locale_rollout)
       ON CONFLICT (code) DO UPDATE SET native_name = EXCLUDED.native_name,
         is_active = EXCLUDED.is_active, is_source = EXCLUDED.is_source,
         rollout_status = EXCLUDED.rollout_status`,
      [l.code, l.nativeName, l.isActive, l.isSource, l.rolloutStatus ?? "planned"],
    );
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function upsertPage(exec: PgExec, slug: string): Promise<number> {
  try {
    const rows = await exec.query<{ id: number }>(
      `INSERT INTO content.service_content_pages (slug) VALUES ($1)
       ON CONFLICT (slug) DO UPDATE SET updated_at = now() RETURNING id`,
      [slug],
    );
    return rows[0].id;
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function createBlock(exec: PgExec, b: NewBlock): Promise<number> {
  validateCoreConfig(b.kind, b.coreConfig ?? {});
  try {
    const rows = await exec.query<{ id: number }>(
      `INSERT INTO content.service_content_blocks (page_id, kind, block_key, position, icon, core_config)
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

/** Get-or-create a localization WITHOUT ever UPDATEing it (locale/block_id are immutable identity).
 *  ON CONFLICT DO NOTHING returns no row on an existing pair, so we then SELECT the existing id — a
 *  path that succeeds with runtime privileges (INSERT + SELECT, no UPDATE on the table). */
export async function upsertLocalization(
  exec: PgExec,
  blockId: number,
  locale: string,
): Promise<number> {
  try {
    const inserted = await exec.query<{ id: number }>(
      `INSERT INTO content.service_content_localizations (block_id, locale) VALUES ($1, $2)
       ON CONFLICT (block_id, locale) DO NOTHING RETURNING id`,
      [blockId, locale],
    );
    if (inserted.length > 0) return inserted[0].id;
    const existing = await exec.query<{ id: number }>(
      `SELECT id FROM content.service_content_localizations WHERE block_id = $1 AND locale = $2`,
      [blockId, locale],
    );
    return existing[0].id;
  } catch (err) {
    throw mapDbError(err);
  }
}

/** Create a new immutable DRAFT revision via content.create_draft_revision (status forced to 'draft').
 *  Validated by the block's kind BEFORE the DB call. Does NOT change what is published, and cannot
 *  create a reviewed revision — the runtime has no direct revision INSERT. */
export async function createDraftRevision(
  exec: PgExec,
  kind: Kind,
  r: NewRevision,
): Promise<number> {
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
  // Public read: the page is published, the requested locale is active AND at public rollout, the block
  // is active, and a publication pointer exists for that localization. No cross-locale fallback: a
  // missing/non-public locale simply omits the block. Uses the schema's actual enum values.
  return exec.query<PublishedBlockRow>(
    `SELECT b.id, b.block_key, b.kind, b.position, b.icon, b.core_config,
            r.title, r.description, r.translated_payload
       FROM content.service_content_pages p
       JOIN content.service_content_blocks b ON b.page_id = p.id AND b.is_active = true
       JOIN content.service_content_localizations l ON l.block_id = b.id AND l.locale = $2
       JOIN content.content_locales cl ON cl.code = l.locale
        AND cl.is_active = true AND cl.rollout_status = 'public'
       JOIN content.service_content_publications pub ON pub.localization_id = l.id
       JOIN content.service_content_revisions r ON r.id = pub.revision_id
      WHERE p.slug = $1 AND p.status = 'published'
      ORDER BY b.kind, b.position, b.id`,
    [pageSlug, locale],
  );
}
