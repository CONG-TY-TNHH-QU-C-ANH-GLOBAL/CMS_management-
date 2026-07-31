// POC self-check for the PostgreSQL content data plane. Runs REAL PostgreSQL in-process (PGlite) —
// no server, no cloud creds — and proves the vertical slice end-to-end. Standalone, matching the CMS
// self-check convention:  bun run scripts/pg-content-poc-selfcheck.ts   (exit non-zero on any failure).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

import { computeSourceHash } from "../src/features/translations/translations.hash";
import { pgliteExec, type PgExec } from "../src/features/content-pg/pg-adapter";
import { ContentError, type ContentErrorCode } from "../src/features/content-pg/content.errors";
import { toPublicDto } from "../src/features/content-pg/content.dto";
import {
  upsertLocale,
  upsertPage,
  createBlock,
  upsertLocalization,
  createDraftRevision,
  approveRevision,
  publish,
  getPublishedBlocks,
  type NewRevision,
} from "../src/features/content-pg/content.repo";
import { type Kind } from "../src/features/content-pg/content.kinds";
import {
  FULFILL_CONTENT_MANIFEST,
  type ContentManifest,
} from "../src/features/content-pg/manifests/fulfill.content";
import { runDisposableWritePath } from "./pg-smoke-writepath";

let passed = 0;
let failed = 0;
/** Record a single boolean assertion result. (A value check — it does not select an action.) */
function ok(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

// ── Intent-named negative assertions. Each expects ONE specific failure mode; none takes a
//    behaviour-selecting flag. ────────────────────────────────────────────────────────────────────
async function expectThrowMatching(
  fn: () => Promise<unknown>,
  matcher: RegExp,
  label: string,
): Promise<void> {
  try {
    await fn();
    ok(false, `${label} (expected a rejection, none thrown)`);
  } catch (e) {
    ok(matcher.test(e instanceof Error ? e.message : String(e)), label);
  }
}
async function expectContentErrorCode(
  fn: () => Promise<unknown>,
  code: ContentErrorCode,
  label: string,
): Promise<void> {
  try {
    await fn();
    ok(false, `${label} (expected ContentError:${code}, none thrown)`);
  } catch (e) {
    ok(e instanceof ContentError && e.code === code, `${label} (${(e as ContentError).code ?? e})`);
  }
}
const expectConstraintViolation = (fn: () => Promise<unknown>, label: string) =>
  expectThrowMatching(fn, /foreign key|violates|duplicate key|23503/i, label);
const expectImmutableRejection = (fn: () => Promise<unknown>, label: string) =>
  expectThrowMatching(fn, /append-only|immutable/i, label);
const expectPermissionDenied = (fn: () => Promise<unknown>, label: string) =>
  expectThrowMatching(fn, /permission denied|not.*allowed/i, label);
const expectValidationError = (fn: () => Promise<unknown>, code: ContentErrorCode, label: string) =>
  expectContentErrorCode(fn, code, label);
const expectNotPublishable = (fn: () => Promise<unknown>, label: string) =>
  expectContentErrorCode(fn, "not_publishable", label);
const expectConflict = (fn: () => Promise<unknown>, label: string) =>
  expectContentErrorCode(fn, "conflict", label);

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
async function seedLocales(exec: PgExec, locales: readonly string[]): Promise<void> {
  const meta: Record<string, { nativeName: string; isSource: boolean }> = {
    vi: { nativeName: "Tiếng Việt", isSource: true },
    en: { nativeName: "English", isSource: false },
    zh: { nativeName: "中文", isSource: false },
  };
  for (const code of locales) {
    await upsertLocale(exec, {
      code,
      nativeName: meta[code].nativeName,
      isActive: true,
      isSource: meta[code].isSource,
    });
  }
}

/** Apply the ORDERED migration set (0001..0005), one file per concern, in filename order — the same
 *  contract a direct-connection runner uses in the real deployment. */
function applyMigrations(db: PGlite): Promise<void> {
  const dir = fileURLToPath(new URL("../db/pg/migrations/", import.meta.url));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  return files.reduce(
    (chain, f) =>
      chain.then(() =>
        db
          .exec(readFileSync(new URL(`../db/pg/migrations/${f}`, import.meta.url), "utf8"))
          .then(() => undefined),
      ),
    Promise.resolve(),
  );
}

async function freshDb(): Promise<PgExec> {
  const db = new PGlite();
  await applyMigrations(db); // the ordered migration set applies cleanly (private `content` schema)
  await db.exec("SET search_path TO content, public;"); // mirrors the runtime role's pinned path
  const exec = pgliteExec(db);
  await seedLocales(exec, ["vi", "en", "zh"]);
  return exec;
}

/** Like freshDb but ALSO applies the real role/privilege bootstrap and returns the raw PGlite handle
 *  so tests can `SET ROLE thg_cms_runtime` and prove least-privilege. PGlite enforces column-level
 *  GRANTs, SET ROLE, and SECURITY DEFINER ownership (verified), so these are real privilege checks. */
async function freshDbWithRoles(): Promise<{ db: PGlite; exec: PgExec }> {
  const db = new PGlite();
  await applyMigrations(db);
  await db.exec(
    readFileSync(
      fileURLToPath(new URL("../db/pg/bootstrap/0001_roles_and_privileges.sql", import.meta.url)),
      "utf8",
    ),
  );
  await db.exec("SET search_path TO content, public;"); // session path persists across SET ROLE
  const exec = pgliteExec(db);
  await seedLocales(exec, ["vi", "en"]);
  return { db, exec };
}

/** Create a page + one block + one localization in one step (the common "arrange" for many tests). */
async function seedLocalizedBlock(
  exec: PgExec,
  opts: {
    pageSlug?: string;
    kind?: Kind;
    blockKey?: string;
    position?: number;
    locale?: string;
    icon?: string;
  },
): Promise<{ pageId: number; blockId: number; locId: number }> {
  const pageId = await upsertPage(exec, opts.pageSlug ?? "thg-fulfill");
  const blockId = await createBlock(exec, {
    pageId,
    kind: opts.kind ?? "capability",
    blockKey: opts.blockKey ?? "hub",
    position: opts.position ?? 1,
    icon: opts.icon,
  });
  const locId = await upsertLocalization(exec, blockId, opts.locale ?? "vi");
  return { pageId, blockId, locId };
}

/** Draft → approve in one step: the ONLY way to a reviewed revision (approval copies the exact draft). */
async function reviewedRevision(
  exec: PgExec,
  kind: Kind,
  r: NewRevision,
  reviewerId = 1,
): Promise<number> {
  return approveRevision(exec, await createDraftRevision(exec, kind, r), reviewerId);
}

/** Draft → approve → publish, the full happy path, returning the published revision id. */
async function publishReviewed(
  exec: PgExec,
  kind: Kind,
  locId: number,
  r: NewRevision,
): Promise<number> {
  const revId = await reviewedRevision(exec, kind, { ...r, localizationId: locId });
  await publish(exec, locId, revId);
  return revId;
}

/** Raw INSERT of a revision at an arbitrary status — used ONLY to fabricate stale/failed fixtures (no
 *  runtime path creates those). Runs as the PGlite superuser; the immutability trigger only blocks
 *  UPDATE/DELETE, not INSERT. The status is cast to the review_status enum. */
async function insertRawRevision(
  exec: PgExec,
  localizationId: number,
  status: string,
  title = "raw",
): Promise<number> {
  const rows = await exec.query<{ id: number }>(
    `INSERT INTO service_content_revisions (localization_id, title, description, review_status)
     VALUES ($1, $2, 'd', $3::content.review_status) RETURNING id`,
    [localizationId, title, status],
  );
  return rows[0].id;
}

/** Generic manifest importer (sketch of the future importer): validate-by-kind is enforced in the repo;
 *  identity/integrity is enforced by the DB. Each locale goes draft → approve → publish in one tx. */
async function importManifest(exec: PgExec, m: ContentManifest): Promise<void> {
  await exec.tx(async (tx) => {
    const pageId = await upsertPage(tx, m.pageSlug);
    for (const b of m.blocks) {
      const blockId = await createBlock(tx, {
        pageId,
        kind: b.kind,
        blockKey: b.blockKey,
        position: b.position,
        coreConfig: b.coreConfig,
      });
      const vi = b.localizations.vi;
      const sourceHash = await computeSourceHash({
        title: vi.title ?? "",
        description: vi.description ?? "",
        payload_json: JSON.stringify(vi.translatedPayload),
      });
      for (const locale of ["vi", "en", "zh"] as const) {
        const loc = b.localizations[locale];
        const localizationId = await upsertLocalization(tx, blockId, locale);
        await publishReviewed(tx, b.kind, localizationId, {
          localizationId,
          title: loc.title,
          description: loc.description,
          translatedPayload: loc.translatedPayload,
          sourceLocale: locale === "vi" ? null : "vi",
          sourceHash,
        });
      }
    }
  });
}

async function main(): Promise<void> {
  console.log("PG content data-plane POC — PGlite (real PostgreSQL, in-process)\n");

  // ── Core lifecycle: draft → approve → publish ────────────────────────────────────────────────
  {
    const exec = await freshDb();
    const { pageId, locId, revId } = await exec.tx(async (tx) => {
      const seeded = await seedLocalizedBlock(tx, {
        kind: "journey_step",
        blockKey: "design-input",
      });
      const revId = await publishReviewed(tx, "journey_step", seeded.locId, {
        localizationId: seeded.locId,
        title: "Design Input",
        description: "v1 desc",
      });
      return { pageId: seeded.pageId, locId: seeded.locId, revId };
    });
    const blocks = await getPublishedBlocks(exec, "thg-fulfill", "vi");
    ok(
      pageId > 0 && blocks.length === 1 && blocks[0].title === "Design Input",
      "transactional create → 1 published VI block",
    );

    // reviewed != published — an extra reviewed revision that is NOT the pointer is not served.
    const otherLocId = await upsertLocalization(exec, blocks[0].id, "en");
    await reviewedRevision(exec, "journey_step", {
      localizationId: otherLocId,
      title: "reviewed-not-published",
      description: "x",
    });
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "en")).length === 0,
      "reviewed revision without publish pointer is NOT served",
    );

    // a NEW draft does not alter published content, and publishing a draft is rejected by the DB.
    const rev2draft = await createDraftRevision(exec, "journey_step", {
      localizationId: locId,
      title: "Design Input EDITED",
      description: "v2 desc",
    });
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Design Input",
      "new draft does NOT change published content",
    );
    await expectNotPublishable(
      () => publish(exec, locId, rev2draft),
      "publishing a draft revision is rejected by content.publish_revision",
    );
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Design Input",
      "rejected publish leaves the current published revision unchanged",
    );
    const rev2 = await approveRevision(exec, rev2draft, 1);
    await publish(exec, locId, rev2, revId); // optimistic: expect the pointer still holds revId
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Design Input EDITED",
      "publish atomically moves the pointer to the approved revision",
    );
    ok(revId !== rev2, "revisions are append-only (distinct ids)");
  }

  // ── DB-enforced identity + registry validation ──────────────────────────────────────────────
  {
    const exec = await freshDb();
    const pageId = await upsertPage(exec, "thg-fulfill");
    await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 4 });
    await expectValidationError(
      () => createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 9 }),
      "duplicate_identity",
      "duplicate (page,kind,block_key) rejected by PostgreSQL",
    );
    await expectValidationError(
      () => createBlock(exec, { pageId, kind: "nope" as never, blockKey: "x", position: 1 }),
      "unknown_kind",
      "unknown kind rejected on write",
    );
    await expectValidationError(
      () =>
        createBlock(exec, {
          pageId,
          kind: "process_step",
          blockKey: "s1",
          position: 1,
          coreConfig: { num: "not-int" } as never,
        }),
      "invalid_core_config",
      "invalid core_config rejected",
    );
    const blockId = await createBlock(exec, {
      pageId,
      kind: "solution",
      blockKey: "sol1",
      position: 1,
    });
    const locId = await upsertLocalization(exec, blockId, "vi");
    await expectValidationError(
      () =>
        createDraftRevision(exec, "solution", {
          localizationId: locId,
          title: "t",
          description: "d",
          translatedPayload: { wrong: true },
        }),
      "invalid_payload",
      "invalid translated_payload rejected",
    );
    await expectValidationError(
      () =>
        createDraftRevision(exec, "process_step", { localizationId: locId, title: "only title" }),
      "invalid_text",
      "missing required description rejected (process_step)",
    );
  }

  // ── VI/EN/ZH symmetry + locale isolation + no cross-fallback ────────────────────────────────
  {
    const exec = await freshDb();
    const { pageId, blockId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    for (const [locale, title] of [
      ["vi", "Hub VI"],
      ["en", "Hub EN"],
      ["zh", "Hub ZH"],
    ] as const) {
      const locId = await upsertLocalization(exec, blockId, locale);
      await publishReviewed(exec, "capability", locId, {
        localizationId: locId,
        title,
        description: `${locale} desc`,
        sourceLocale: locale === "vi" ? null : "vi",
      });
    }
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Hub VI",
      "VI resolves its own published revision (VI is a normal locale)",
    );
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "zh"))[0].title === "Hub ZH",
      "ZH resolves its own published revision (symmetric model)",
    );
    // A second block published only in VI must NOT appear for EN (no cross-locale fallback).
    const b2 = await createBlock(exec, {
      pageId,
      kind: "capability",
      blockKey: "network",
      position: 2,
    });
    const l2 = await upsertLocalization(exec, b2, "vi");
    await publishReviewed(exec, "capability", l2, {
      localizationId: l2,
      title: "VI only",
      description: "d",
    });
    ok((await getPublishedBlocks(exec, "thg-fulfill", "vi")).length === 2, "VI sees both blocks");
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "en")).length === 1,
      "EN omits the VI-only block (no cross-fallback)",
    );
  }

  // ── DTO compatibility + shadow-read parity (D1-V1 fixture vs PG compat DTO) ───────────────────
  {
    const exec = await freshDb();
    const { locId } = await seedLocalizedBlock(exec, {
      pageSlug: "thg-order",
      kind: "solution",
      blockKey: "trust",
      locale: "en",
      icon: "🛡️",
    });
    await publishReviewed(exec, "solution", locId, {
      localizationId: locId,
      title: "Real business",
      description: "Registered.",
      translatedPayload: { tag: "Trust & Safety" },
    });
    const pgDto = toPublicDto((await getPublishedBlocks(exec, "thg-order", "en"))[0]);
    // What the current D1 V1 endpoint emits for the same content (fixture).
    const v1Dto = {
      kind: "solution",
      position: 1,
      icon: "🛡️",
      title: "Real business",
      description: "Registered.",
      payload: { tag: "Trust & Safety" },
    };
    const cmp = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    ok(
      cmp(pgDto.kind, v1Dto.kind) &&
        pgDto.position === v1Dto.position &&
        cmp(pgDto.icon, v1Dto.icon) &&
        cmp(pgDto.title, v1Dto.title) &&
        cmp(pgDto.description, v1Dto.description),
      "shadow parity: kind/position/icon/title/description match V1",
    );
    ok(cmp(pgDto.payload.tag, v1Dto.payload.tag), "shadow parity: order payload.tag matches V1");
    ok(
      pgDto.block_key === "trust" && pgDto.payload.key === "trust",
      "Fulfill contract: payload.key === block_key (identity preserved)",
    );
  }

  // ── Fulfill manifest import round-trips (draft → approve → publish per locale) ────────────────
  {
    const exec = await freshDb();
    await importManifest(exec, FULFILL_CONTENT_MANIFEST);
    for (const locale of ["vi", "en", "zh"] as const) {
      const blocks = await getPublishedBlocks(exec, "thg-fulfill", locale);
      ok(blocks.length === 14, `manifest import: 14 published blocks resolve for ${locale}`);
    }
    const vi = await getPublishedBlocks(exec, "thg-fulfill", "vi");
    const heading = vi.find((b) => b.block_key === "consult-heading");
    ok(
      !!heading && heading.title === "Mở hồ sơ vận hành." && heading.description === null,
      "manifest: section_copy title/NULL description preserved",
    );
    ok(
      vi.every((b) => toPublicDto(b).payload.key === b.block_key),
      "manifest: every DTO carries payload.key = block_key",
    );
  }

  // ── Publication ownership enforced by the DB (composite FK), not by service code ─────────────
  {
    const exec = await freshDb();
    const { blockId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    const locVi = await upsertLocalization(exec, blockId, "vi");
    const locEn = await upsertLocalization(exec, blockId, "en");
    await reviewedRevision(exec, "capability", {
      localizationId: locVi,
      title: "VI",
      description: "d",
    });
    const revEn = await reviewedRevision(exec, "capability", {
      localizationId: locEn,
      title: "EN",
      description: "d",
    });
    // Publish localization A (vi) pointing at revision R that belongs to localization B (en).
    await expectConstraintViolation(
      () =>
        exec.query(
          "INSERT INTO service_content_publications (localization_id, revision_id) VALUES ($1, $2)",
          [locVi, revEn],
        ),
      "publication cannot point to a revision from another localization (composite FK rejects)",
    );
  }

  // ── Revisions are immutable at the DB level (append-only) ────────────────────────────────────
  {
    const exec = await freshDb();
    const { locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    const revId = await reviewedRevision(exec, "capability", {
      localizationId: locId,
      title: "orig",
      description: "d",
    });
    await expectImmutableRejection(
      () =>
        exec.query("UPDATE service_content_revisions SET title = 'mutated' WHERE id = $1", [revId]),
      "UPDATE of a revision is rejected (immutable history)",
    );
    await expectImmutableRejection(
      () => exec.query("DELETE FROM service_content_revisions WHERE id = $1", [revId]),
      "DELETE of a revision is rejected (immutable history)",
    );
  }

  // ── Review provenance: draft → approve lineage, enforced in the DB ───────────────────────────
  {
    const exec = await freshDb();
    const { blockId, locId } = await seedLocalizedBlock(exec, {
      pageSlug: "thg-order",
      kind: "solution",
      blockKey: "hub",
      locale: "vi",
    });

    // create_draft_revision ALWAYS creates a draft (caller cannot choose status).
    const draftId = await createDraftRevision(exec, "solution", {
      localizationId: locId,
      title: "Hub",
      description: "desc",
      translatedPayload: { tag: "T" },
      sourceHash: "hash-123",
    });
    const draftRow = (
      await exec.query<{ review_status: string; reviewed_from_revision_id: number | null }>(
        "SELECT review_status, reviewed_from_revision_id FROM service_content_revisions WHERE id = $1",
        [draftId],
      )
    )[0];
    ok(draftRow.review_status === "draft", "create_draft_revision always creates a draft");
    ok(draftRow.reviewed_from_revision_id === null, "a draft carries no review lineage");

    // approve copies the EXACT draft content and records lineage + reviewer.
    const reviewedId = await approveRevision(exec, draftId, 42);
    const rev = (
      await exec.query<{
        title: string;
        description: string;
        translated_payload: Record<string, unknown>;
        source_hash: string;
        review_status: string;
        reviewed_from_revision_id: number | null;
        reviewed_by: number | null;
        reviewed_at: string | null;
      }>(
        `SELECT title, description, translated_payload, source_hash, review_status,
                reviewed_from_revision_id, reviewed_by, reviewed_at
           FROM service_content_revisions WHERE id = $1`,
        [reviewedId],
      )
    )[0];
    ok(
      rev.review_status === "reviewed" &&
        rev.title === "Hub" &&
        rev.description === "desc" &&
        JSON.stringify(rev.translated_payload) === JSON.stringify({ tag: "T" }) &&
        rev.source_hash === "hash-123",
      "approve_revision copies the EXACT draft content + preserves source_hash provenance",
    );
    ok(
      rev.reviewed_from_revision_id === draftId,
      "reviewed revision records reviewed_from_revision_id = the draft",
    );
    ok(
      rev.reviewed_by === 42 && rev.reviewed_at !== null,
      "reviewed revision records reviewer + reviewed_at",
    );

    // approving the SAME draft twice is rejected (uq_reviewed_from → conflict).
    await expectConflict(
      () => approveRevision(exec, draftId, 42),
      "a draft cannot be approved twice",
    );

    // a stale or failed draft is not reviewable; nor is a missing revision.
    const staleId = await insertRawRevision(exec, locId, "stale");
    const failedId = await insertRawRevision(exec, locId, "failed");
    await expectNotPublishable(
      () => approveRevision(exec, staleId, 1),
      "a stale revision cannot be approved",
    );
    await expectNotPublishable(
      () => approveRevision(exec, failedId, 1),
      "a failed revision cannot be approved",
    );
    await expectNotPublishable(
      () => approveRevision(exec, 999999, 1),
      "approving a missing revision is rejected",
    );

    // cross-localization lineage is impossible: a reviewed row cannot claim a draft from another
    // localization (composite FK on (localization_id, reviewed_from_revision_id)).
    const enLoc = await upsertLocalization(exec, blockId, "en");
    const enDraft = await createDraftRevision(exec, "solution", {
      localizationId: enLoc,
      title: "EN",
      description: "d",
      translatedPayload: { tag: "e" },
    });
    await expectConstraintViolation(
      () =>
        exec.query(
          `INSERT INTO service_content_revisions (localization_id, title, description, review_status, reviewed_from_revision_id)
           VALUES ($1, 'x', 'y', 'reviewed', $2)`,
          [locId, enDraft], // vi localization claiming an en draft
        ),
      "cross-localization review lineage is rejected by the composite FK",
    );

    // the approved revision publishes.
    await publish(exec, locId, reviewedId);
    ok(
      (await getPublishedBlocks(exec, "thg-order", "vi"))[0].title === "Hub",
      "an approved revision publishes successfully",
    );
  }

  // ── Publication eligibility enforced by content.publish_revision (not service code) ──────────
  {
    const exec = await freshDb();
    const { blockId, locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });

    // reviewed → publishes; establishes the baseline pointer.
    const reviewed = await publishReviewed(exec, "capability", locId, {
      localizationId: locId,
      title: "t-reviewed",
      description: "d",
    });
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed",
      "reviewed revision publishes",
    );

    // every non-reviewed state is rejected, and the baseline pointer never moves.
    const draft = await createDraftRevision(exec, "capability", {
      localizationId: locId,
      title: "t-draft",
      description: "d",
    });
    const stale = await insertRawRevision(exec, locId, "stale", "t-stale");
    const failed = await insertRawRevision(exec, locId, "failed", "t-failed");
    for (const [bad, rev] of [
      ["draft", draft],
      ["stale", stale],
      ["failed", failed],
    ] as const) {
      await expectNotPublishable(() => publish(exec, locId, rev), `${bad} revision is rejected`);
      ok(
        (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed",
        `published pointer unchanged after rejected ${bad} publish`,
      );
    }

    // cross-localization publish stays rejected through the function too (ownership re-checked).
    const enLoc = await upsertLocalization(exec, blockId, "en");
    await expectNotPublishable(
      () => publish(exec, enLoc, reviewed),
      "cross-localization publish rejected by function",
    );

    // approved move is atomic: pointer flips to the new reviewed revision in one call.
    const reviewed2 = await reviewedRevision(exec, "capability", {
      localizationId: locId,
      title: "t-reviewed2",
      description: "d",
    });
    await publish(exec, locId, reviewed2, reviewed);
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed2",
      "atomic move: pointer now on reviewed2",
    );
    // optimistic concurrency: a stale expected-pointer is rejected as a conflict.
    await expectConflict(
      () => publish(exec, locId, reviewed2, reviewed),
      "stale optimistic token rejected",
    );
  }

  // ── Deletion / history semantics — RESTRICT boundaries, soft-delete + archive lifecycle ──────
  {
    const exec = await freshDb();
    const { pageId, blockId, locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    await publishReviewed(exec, "capability", locId, {
      localizationId: locId,
      title: "keep",
      description: "d",
    });
    // Historical boundaries reject hard delete PREDICTABLY (FK RESTRICT → 23503), not via the trigger.
    await expectConstraintViolation(
      () => exec.query("DELETE FROM service_content_blocks WHERE id = $1", [blockId]),
      "deleting a block that has localizations/revisions is rejected (RESTRICT)",
    );
    await expectConstraintViolation(
      () => exec.query("DELETE FROM service_content_pages WHERE id = $1", [pageId]),
      "deleting a page that owns blocks is rejected (RESTRICT)",
    );
    // Supported lifecycle: disable the block, archive the page — history stays intact.
    await exec.query("UPDATE service_content_blocks SET is_active = false WHERE id = $1", [
      blockId,
    ]);
    await exec.query("UPDATE service_content_pages SET status = 'archived' WHERE id = $1", [
      pageId,
    ]);
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi")).length === 0,
      "disabled block is not served (soft-delete)",
    );
    const revCount = await exec.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM service_content_revisions",
    );
    ok(revCount[0].n === 2, "no historical revision was removed by the lifecycle operations");
    // Empty scaffolding (no localizations) IS deletable — documented behavior.
    const emptyBlock = await createBlock(exec, {
      pageId,
      kind: "capability",
      blockKey: "scratch",
      position: 9,
    });
    await exec.query("DELETE FROM service_content_blocks WHERE id = $1", [emptyBlock]);
    ok(true, "empty block with no localizations can be deleted (documented cleanup path)");
  }

  // ── Least-privilege runtime role — real column-level GRANTs + function-only revision path ─────
  {
    const { db, exec } = await freshDbWithRoles();
    const { pageId, blockId, locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    const draftId = await createDraftRevision(exec, "capability", {
      localizationId: locId,
      title: "t",
      description: "d",
    });
    const reviewedId = await approveRevision(exec, draftId, 1);
    const draft2 = await createDraftRevision(exec, "capability", {
      localizationId: locId,
      title: "t2",
      description: "d",
    });

    const asRuntime = async (sql: string) => {
      await db.exec("SET ROLE thg_cms_runtime;");
      try {
        await db.exec(sql);
      } finally {
        await db.exec("RESET ROLE;");
      }
    };
    const denied = (sql: string, label: string) =>
      expectPermissionDenied(() => asRuntime(sql), label);
    const allowed = async (sql: string, label: string) => {
      try {
        await asRuntime(sql);
        ok(true, label);
      } catch (e) {
        ok(false, `${label} (${(e as Error).message})`);
      }
    };

    // Mutable structure columns → allowed.
    await allowed(
      `UPDATE content.service_content_blocks SET position = 2, is_active = false WHERE id = ${blockId}`,
      "runtime may UPDATE block position/is_active",
    );
    await allowed(
      `UPDATE content.service_content_pages SET status = 'archived' WHERE id = ${pageId}`,
      "runtime may UPDATE page status",
    );
    // Business-identity columns → denied.
    await denied(
      `UPDATE content.service_content_blocks SET kind = 'solution' WHERE id = ${blockId}`,
      "runtime may NOT UPDATE block kind",
    );
    await denied(
      `UPDATE content.service_content_blocks SET block_key = 'x' WHERE id = ${blockId}`,
      "runtime may NOT UPDATE block_key",
    );
    await denied(
      `UPDATE content.service_content_blocks SET page_id = ${pageId} WHERE id = ${blockId}`,
      "runtime may NOT UPDATE block page_id",
    );
    await denied(
      `UPDATE content.service_content_pages SET slug = 'x' WHERE id = ${pageId}`,
      "runtime may NOT UPDATE page slug",
    );
    await denied(
      `UPDATE content.service_content_localizations SET locale = 'en' WHERE id = ${locId}`,
      "runtime may NOT UPDATE localization identity",
    );
    await denied(
      `UPDATE content.service_content_blocks SET version = 99 WHERE id = ${blockId}`,
      "runtime may NOT UPDATE block version (trigger-owned)",
    );
    // upsertLocalization's conflict path succeeds with runtime privileges (INSERT + SELECT, no UPDATE).
    await db.exec("SET ROLE thg_cms_runtime;");
    try {
      await db.query(
        `INSERT INTO content.service_content_localizations (block_id, locale) VALUES (${blockId}, 'vi') ON CONFLICT (block_id, locale) DO NOTHING`,
      );
      const r = await db.query<{ id: number }>(
        `SELECT id FROM content.service_content_localizations WHERE block_id = ${blockId} AND locale = 'vi'`,
      );
      ok(
        r.rows.length === 1 && r.rows[0].id === locId,
        "runtime upsertLocalization conflict path returns the existing id (no UPDATE needed)",
      );
    } finally {
      await db.exec("RESET ROLE;");
    }
    // Revisions: NO direct write of ANY kind — the runtime cannot fabricate a revision.
    await denied(
      `INSERT INTO content.service_content_revisions (localization_id, title, review_status) VALUES (${locId}, 'x', 'draft')`,
      "runtime may NOT INSERT a draft revision directly",
    );
    await denied(
      `INSERT INTO content.service_content_revisions (localization_id, title, review_status) VALUES (${locId}, 'x', 'reviewed')`,
      "runtime may NOT INSERT an arbitrary reviewed revision directly",
    );
    await denied(
      `UPDATE content.service_content_revisions SET title = 'x' WHERE id = ${reviewedId}`,
      "runtime may NOT UPDATE a revision",
    );
    await denied(
      `DELETE FROM content.service_content_revisions WHERE id = ${reviewedId}`,
      "runtime may NOT DELETE a revision",
    );
    // Publications: no direct write.
    await denied(
      `INSERT INTO content.service_content_publications (localization_id, revision_id) VALUES (${locId}, ${reviewedId})`,
      "runtime may NOT INSERT a publication directly",
    );
    // The functions ARE the runtime's only write path (EXECUTE granted; definer = fn_owner).
    await allowed(
      `SELECT content.create_draft_revision(${locId}, 'via-fn', 'd', '{}'::jsonb, NULL, '', NULL)`,
      "runtime MAY create a draft via create_draft_revision",
    );
    await allowed(
      `SELECT content.approve_revision(${draft2}, 1, NULL)`,
      "runtime MAY approve a draft via approve_revision",
    );
    await allowed(
      `SELECT content.publish_revision(${locId}, ${reviewedId}, NULL, NULL)`,
      "runtime MAY publish via publish_revision",
    );
  }

  // ── Publication concurrency — compare-and-swap against the exact expected pointer ────────────────
  //    NOTE: PGlite is a single in-process connection, so true wall-clock concurrency cannot be run
  //    here; these assertions prove the compare-and-swap INVARIANT that the FOR UPDATE localization lock
  //    enforces under real concurrency. The required wall-clock concurrent test belongs to the Phase-2
  //    preview/Hyperdrive gate (see db/pg/README).
  {
    const exec = await freshDb();
    const { locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    const r1 = await reviewedRevision(exec, "capability", {
      localizationId: locId,
      title: "r1",
      description: "d",
    });
    const r2 = await reviewedRevision(exec, "capability", {
      localizationId: locId,
      title: "r2",
      description: "d",
    });

    // First publish expects NO current publication (NULL) and wins.
    await publish(exec, locId, r1);
    // A second "first publish" (still expecting none) when a publication exists loses with conflict…
    await expectConflict(
      () => publish(exec, locId, r2),
      "two first-publishes (expected none) cannot both succeed — loser gets conflict",
    );
    // …and the winner's pointer is unchanged.
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "r1",
      "rejected first-publish does not alter the winner",
    );

    // Republish with the correct expected pointer succeeds; a second republish with the SAME (now stale)
    // expected pointer loses with conflict.
    await publish(exec, locId, r2, r1);
    await expectConflict(
      () => publish(exec, locId, r1, r1),
      "two republishes with the same expected pointer cannot both succeed — loser gets conflict",
    );
    const served = await getPublishedBlocks(exec, "thg-fulfill", "vi");
    ok(
      served.length === 1 && served[0].title === "r2",
      "the pointer ends on exactly one approved revision",
    );
  }

  // ── Block optimistic version — trigger-maintained, never caller-assignable ────────────────────────
  {
    const exec = await freshDb();
    const { blockId, locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    const versionOf = async () =>
      (
        await exec.query<{ version: number }>(
          "SELECT version FROM service_content_blocks WHERE id = $1",
          [blockId],
        )
      )[0].version;
    ok((await versionOf()) === 1, "a new block starts at version 1");
    await exec.query("UPDATE service_content_blocks SET position = position + 1 WHERE id = $1", [
      blockId,
    ]);
    ok((await versionOf()) === 2, "a mutable structure change bumps version by exactly one");
    await exec.query("UPDATE service_content_blocks SET position = position WHERE id = $1", [
      blockId,
    ]);
    ok((await versionOf()) === 2, "a no-op update does not bump version");
    // Even a superuser cannot assign a version: the trigger recomputes it (a structural change → +1).
    await exec.query("UPDATE service_content_blocks SET version = 99, icon = 'x' WHERE id = $1", [
      blockId,
    ]);
    const curV = await versionOf();
    ok(curV === 3, "a caller-supplied version is ignored; the trigger bumps to 3");
    // approve_revision honors the block version as an optimistic token.
    const draft = await createDraftRevision(exec, "capability", {
      localizationId: locId,
      title: "v",
      description: "d",
    });
    await expectConflict(
      () => approveRevision(exec, draft, 1, curV - 1),
      "approve with a stale expected block version is rejected",
    );
    ok(
      (await approveRevision(exec, draft, 1, curV)) > 0,
      "approve with the correct expected block version succeeds",
    );
  }

  // ── Bootstrap ownership transfer under a NON-superuser migration operator ─────────────────────────
  {
    const db = new PGlite();
    // A privileged-but-NON-superuser operator that OWNS the schema (as the real migration owner does,
    // having created it in migration 0001) — ownership gives it grant-option on schema privileges.
    await db.exec("CREATE ROLE mig_op NOSUPERUSER NOBYPASSRLS CREATEROLE;");
    await db.exec("CREATE SCHEMA content AUTHORIZATION mig_op;");
    await db.exec("SET ROLE mig_op;");
    try {
      // (a) operator creates the fn-owner role (creator has ADMIN) and a function it owns.
      await db.exec("CREATE ROLE fn_owner_t NOLOGIN NOSUPERUSER;");
      await db.exec("CREATE FUNCTION content.demo() RETURNS int LANGUAGE sql AS 'SELECT 1';");
      // (b) member-of target owner, (c) target has CREATE during transfer, then revoke both.
      await db.exec("GRANT fn_owner_t TO CURRENT_USER;");
      await db.exec("GRANT CREATE ON SCHEMA content TO fn_owner_t;");
      await db.exec("ALTER FUNCTION content.demo() OWNER TO fn_owner_t;");
      await db.exec("REVOKE CREATE ON SCHEMA content FROM fn_owner_t;");
      await db.exec("REVOKE fn_owner_t FROM CURRENT_USER;");
      const owner = await db.query<{ o: string }>(
        "SELECT pg_get_userbyid(proowner) AS o FROM pg_proc WHERE proname = 'demo'",
      );
      ok(
        owner.rows[0].o === "fn_owner_t",
        "non-superuser operator transfers SECURITY DEFINER ownership to the NOLOGIN fn-owner",
      );
    } finally {
      await db.exec("RESET ROLE;");
    }
  }

  // ── Smoke write-path rollback proof — the exact runtime-smoke unit, run deterministically here ────
  {
    const exec = await freshDb();
    const pagesBefore = (
      await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_pages")
    )[0].n;
    const checks = await runDisposableWritePath(exec);
    ok(
      checks.length >= 5 && checks.every((c) => c.startsWith("✓")),
      "smoke write-path: all in-transaction checks pass",
    );
    const pagesAfter = (
      await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_pages")
    )[0].n;
    const blocks = (
      await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_blocks")
    )[0].n;
    const revs = (
      await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_revisions")
    )[0].n;
    ok(
      pagesBefore === pagesAfter && blocks === 0 && revs === 0,
      "smoke write-path rolls back — no page/block/revision fixture survives",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
}

// Top-level await with an explicit error boundary. PGlite keeps a WASM handle open, so the event loop
// would not drain on its own — exit explicitly, preserving the non-zero code on any failure.
try {
  await main();
  process.exit(failed > 0 ? 1 : 0);
} catch (e) {
  // Render a non-ContentError safely (name + message only), never dumping arbitrary object internals.
  if (e instanceof ContentError) {
    console.error(`ContentError[${e.code}]: ${e.message}`);
  } else if (e instanceof Error) {
    console.error(`${e.name}: ${e.message}`);
  } else {
    console.error("Non-error thrown:", typeof e);
  }
  process.exit(1);
}
