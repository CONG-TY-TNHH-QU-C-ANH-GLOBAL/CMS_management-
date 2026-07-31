// POC self-check for the PostgreSQL content data plane. Runs REAL PostgreSQL in-process (PGlite) —
// no server, no cloud creds — and proves the vertical slice end-to-end. Standalone, matching the CMS
// self-check convention:  bun run scripts/pg-content-poc-selfcheck.ts   (exit non-zero on any failure).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

import { computeSourceHash } from "../src/features/translations/translations.hash";
import { pgliteExec, type PgExec } from "../src/features/content-pg/pg-adapter";
import { ContentError } from "../src/features/content-pg/content.errors";
import { toPublicDto } from "../src/features/content-pg/content.dto";
import {
  upsertLocale,
  createPage,
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

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}
async function expectContentError(
  fn: () => Promise<unknown>,
  code: string,
  label: string,
): Promise<void> {
  try {
    await fn();
    ok(false, `${label} (expected ContentError:${code}, none thrown)`);
  } catch (e) {
    ok(e instanceof ContentError && e.code === code, `${label} (${(e as ContentError).code ?? e})`);
  }
}
async function expectThrows(fn: () => Promise<unknown>, matcher: RegExp, label: string): Promise<void> {
  try {
    await fn();
    ok(false, `${label} (expected throw, none)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ok(matcher.test(msg), `${label}`);
  }
}

async function freshDb(): Promise<PgExec> {
  const db = new PGlite();
  const schema = readFileSync(
    fileURLToPath(new URL("../db/pg/migrations/0001_service_content.sql", import.meta.url)),
    "utf8",
  );
  await db.exec(schema); // §7: migrations apply cleanly (private `content` schema)
  await db.exec("SET search_path TO content, public;"); // mirrors the runtime role's pinned path
  const exec = pgliteExec(db);
  await upsertLocale(exec, {
    code: "vi",
    nativeName: "Tiếng Việt",
    isActive: true,
    isSource: true,
  });
  await upsertLocale(exec, { code: "en", nativeName: "English", isActive: true, isSource: false });
  await upsertLocale(exec, { code: "zh", nativeName: "中文", isActive: true, isSource: false });
  return exec;
}

/** Like freshDb but ALSO applies the real role/privilege bootstrap and returns the raw PGlite handle
 *  so tests can `SET ROLE thg_cms_runtime` and prove least-privilege. PGlite enforces column-level
 *  GRANTs, SET ROLE, and SECURITY DEFINER ownership (verified), so these are real privilege checks. */
async function freshDbWithRoles(): Promise<{ db: PGlite; exec: PgExec }> {
  const db = new PGlite();
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  await db.exec(read("../db/pg/migrations/0001_service_content.sql"));
  await db.exec(read("../db/pg/bootstrap/0001_roles_and_privileges.sql"));
  await db.exec("SET search_path TO content, public;"); // session path persists across SET ROLE
  const exec = pgliteExec(db);
  await upsertLocale(exec, { code: "vi", nativeName: "Tiếng Việt", isActive: true, isSource: true });
  await upsertLocale(exec, { code: "en", nativeName: "English", isActive: true, isSource: false });
  return { db, exec };
}

/** Draft → approve in one step: the ONLY way to a reviewed revision (approval copies the exact draft). */
async function reviewedRevision(
  exec: PgExec,
  kind: Kind,
  r: NewRevision,
  reviewerId = 1,
): Promise<number> {
  const draftId = await createDraftRevision(exec, kind, r);
  return approveRevision(exec, draftId, reviewerId);
}

/** Raw INSERT of a revision at an arbitrary status — used ONLY to fabricate stale/failed fixtures (no
 *  runtime path creates those). Runs as the PGlite superuser; the immutability trigger only blocks
 *  UPDATE/DELETE, not INSERT. */
async function insertRawRevision(
  exec: PgExec,
  localizationId: number,
  status: string,
  title = "raw",
): Promise<number> {
  const rows = await exec.query<{ id: number }>(
    `INSERT INTO service_content_revisions (localization_id, title, description, review_status)
     VALUES ($1, $2, 'd', $3) RETURNING id`,
    [localizationId, title, status],
  );
  return rows[0].id;
}

/** Generic manifest importer (sketch of the future importer): validate-by-kind is enforced in the repo;
 *  identity/integrity is enforced by the DB. Each locale goes draft → approve → publish in one tx. */
async function importManifest(exec: PgExec, m: ContentManifest): Promise<void> {
  await exec.tx(async (tx) => {
    const pageId = await createPage(tx, m.pageSlug);
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
        const reviewedId = await reviewedRevision(tx, b.kind, {
          localizationId,
          title: loc.title,
          description: loc.description,
          translatedPayload: loc.translatedPayload,
          sourceLocale: locale === "vi" ? null : "vi",
          sourceHash,
        });
        await publish(tx, localizationId, reviewedId);
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
      const pageId = await createPage(tx, "thg-fulfill");
      const blockId = await createBlock(tx, {
        pageId,
        kind: "journey_step",
        blockKey: "design-input",
        position: 1,
      });
      const locId = await upsertLocalization(tx, blockId, "vi");
      const revId = await reviewedRevision(tx, "journey_step", {
        localizationId: locId,
        title: "Design Input",
        description: "v1 desc",
      });
      await publish(tx, locId, revId);
      return { pageId, blockId, locId, revId };
    });
    const blocks = await getPublishedBlocks(exec, "thg-fulfill", "vi");
    ok(
      pageId > 0 && blocks.length === 1 && blocks[0].title === "Design Input",
      "transactional create → 1 published VI block",
    );

    // §7: reviewed != published — an extra reviewed revision that is NOT the pointer is not served.
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

    // §7: a NEW draft does not alter published content, and publishing a draft is rejected by the DB.
    const rev2draft = await createDraftRevision(exec, "journey_step", {
      localizationId: locId,
      title: "Design Input EDITED",
      description: "v2 desc",
    });
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Design Input",
      "new draft does NOT change published content",
    );
    await expectContentError(
      () => publish(exec, locId, rev2draft),
      "not_publishable",
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
    const pageId = await createPage(exec, "thg-fulfill");
    await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 4 });
    await expectContentError(
      () => createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 9 }),
      "duplicate_identity",
      "duplicate (page,kind,block_key) rejected by PostgreSQL",
    );
    await expectContentError(
      () => createBlock(exec, { pageId, kind: "nope" as never, blockKey: "x", position: 1 }),
      "unknown_kind",
      "unknown kind rejected on write",
    );
    await expectContentError(
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
    await expectContentError(
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
    await expectContentError(
      () => createDraftRevision(exec, "process_step", { localizationId: locId, title: "only title" }),
      "invalid_text",
      "missing required description rejected (process_step)",
    );
  }

  // ── VI/EN/ZH symmetry + locale isolation + no cross-fallback ────────────────────────────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, {
      pageId,
      kind: "capability",
      blockKey: "hub",
      position: 1,
    });
    for (const [locale, title] of [
      ["vi", "Hub VI"],
      ["en", "Hub EN"],
      ["zh", "Hub ZH"],
    ] as const) {
      const locId = await upsertLocalization(exec, blockId, locale);
      const rev = await reviewedRevision(exec, "capability", {
        localizationId: locId,
        title,
        description: `${locale} desc`,
        sourceLocale: locale === "vi" ? null : "vi",
      });
      await publish(exec, locId, rev);
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
    await publish(
      exec,
      l2,
      await reviewedRevision(exec, "capability", {
        localizationId: l2,
        title: "VI only",
        description: "d",
      }),
    );
    ok((await getPublishedBlocks(exec, "thg-fulfill", "vi")).length === 2, "VI sees both blocks");
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "en")).length === 1,
      "EN omits the VI-only block (no cross-fallback)",
    );
  }

  // ── DTO compatibility + §8 shadow-read parity (D1-V1 fixture vs PG compat DTO) ───────────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-order");
    const blockId = await createBlock(exec, {
      pageId,
      kind: "solution",
      blockKey: "trust",
      position: 1,
      icon: "🛡️",
    });
    const locId = await upsertLocalization(exec, blockId, "en");
    await publish(
      exec,
      locId,
      await reviewedRevision(exec, "solution", {
        localizationId: locId,
        title: "Real business",
        description: "Registered.",
        translatedPayload: { tag: "Trust & Safety" },
      }),
    );
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

  // ── §9 Fulfill manifest import round-trips (draft → approve → publish per locale) ────────────
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
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locVi = await upsertLocalization(exec, blockId, "vi");
    const locEn = await upsertLocalization(exec, blockId, "en");
    await reviewedRevision(exec, "capability", { localizationId: locVi, title: "VI", description: "d" });
    const revEn = await reviewedRevision(exec, "capability", { localizationId: locEn, title: "EN", description: "d" });
    // Publish localization A (vi) pointing at revision R that belongs to localization B (en).
    await expectThrows(
      () => exec.query("INSERT INTO service_content_publications (localization_id, revision_id) VALUES ($1, $2)", [locVi, revEn]),
      /foreign key|violates/i,
      "publication cannot point to a revision from another localization (composite FK rejects)",
    );
  }

  // ── Revisions are immutable at the DB level (append-only) ────────────────────────────────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");
    const revId = await reviewedRevision(exec, "capability", { localizationId: locId, title: "orig", description: "d" });
    await expectThrows(
      () => exec.query("UPDATE service_content_revisions SET title = 'mutated' WHERE id = $1", [revId]),
      /append-only|immutable/i,
      "UPDATE of a revision is rejected (immutable history)",
    );
    await expectThrows(
      () => exec.query("DELETE FROM service_content_revisions WHERE id = $1", [revId]),
      /append-only|immutable/i,
      "DELETE of a revision is rejected (immutable history)",
    );
  }

  // ── Review provenance: draft → approve lineage, enforced in the DB ───────────────────────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-order");
    const blockId = await createBlock(exec, { pageId, kind: "solution", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");

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
        title: string; description: string; translated_payload: Record<string, unknown>;
        source_hash: string; review_status: string; reviewed_from_revision_id: number | null;
        reviewed_by: number | null; reviewed_at: string | null;
      }>(
        `SELECT title, description, translated_payload, source_hash, review_status,
                reviewed_from_revision_id, reviewed_by, reviewed_at
           FROM service_content_revisions WHERE id = $1`,
        [reviewedId],
      )
    )[0];
    ok(
      rev.review_status === "reviewed" && rev.title === "Hub" && rev.description === "desc" &&
        JSON.stringify(rev.translated_payload) === JSON.stringify({ tag: "T" }) && rev.source_hash === "hash-123",
      "approve_revision copies the EXACT draft content + preserves source_hash provenance",
    );
    ok(rev.reviewed_from_revision_id === draftId, "reviewed revision records reviewed_from_revision_id = the draft");
    ok(rev.reviewed_by === 42 && rev.reviewed_at !== null, "reviewed revision records reviewer + reviewed_at");

    // approving the SAME draft twice is rejected (uq_reviewed_from → conflict).
    await expectContentError(() => approveRevision(exec, draftId, 42), "conflict", "a draft cannot be approved twice");

    // a stale or failed draft is not reviewable.
    const staleId = await insertRawRevision(exec, locId, "stale");
    const failedId = await insertRawRevision(exec, locId, "failed");
    await expectContentError(() => approveRevision(exec, staleId, 1), "not_publishable", "a stale revision cannot be approved");
    await expectContentError(() => approveRevision(exec, failedId, 1), "not_publishable", "a failed revision cannot be approved");
    // approving a non-existent revision is rejected.
    await expectContentError(() => approveRevision(exec, 999999, 1), "not_publishable", "approving a missing revision is rejected");

    // cross-localization lineage is impossible: a reviewed row cannot claim a draft from another
    // localization (composite FK on (localization_id, reviewed_from_revision_id)).
    const enLoc = await upsertLocalization(exec, blockId, "en");
    const enDraft = await createDraftRevision(exec, "solution", { localizationId: enLoc, title: "EN", description: "d", translatedPayload: { tag: "e" } });
    await expectThrows(
      () =>
        exec.query(
          `INSERT INTO service_content_revisions (localization_id, title, description, review_status, reviewed_from_revision_id)
           VALUES ($1, 'x', 'y', 'reviewed', $2)`,
          [locId, enDraft], // vi localization claiming an en draft
        ),
      /foreign key|violates/i,
      "cross-localization review lineage is rejected by the composite FK",
    );

    // the approved revision publishes; a rejected publish leaves the pointer unchanged.
    await publish(exec, locId, reviewedId);
    ok((await getPublishedBlocks(exec, "thg-order", "vi"))[0].title === "Hub", "an approved revision publishes successfully");
  }

  // ── §2 Publication eligibility enforced by content.publish_revision (not service code) ──────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");

    // reviewed → publishes; establishes the baseline pointer.
    const reviewed = await reviewedRevision(exec, "capability", { localizationId: locId, title: "t-reviewed", description: "d" });
    await publish(exec, locId, reviewed);
    ok((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed", "reviewed revision publishes");

    // every non-reviewed state is rejected, and the baseline pointer never moves.
    const draft = await createDraftRevision(exec, "capability", { localizationId: locId, title: "t-draft", description: "d" });
    const stale = await insertRawRevision(exec, locId, "stale", "t-stale");
    const failed = await insertRawRevision(exec, locId, "failed", "t-failed");
    for (const [bad, rev] of [["draft", draft], ["stale", stale], ["failed", failed]] as const) {
      await expectContentError(() => publish(exec, locId, rev), "not_publishable", `${bad} revision is rejected`);
      ok(
        (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed",
        `published pointer unchanged after rejected ${bad} publish`,
      );
    }

    // cross-localization publish stays rejected through the function too (ownership re-checked).
    const enLoc = await upsertLocalization(exec, blockId, "en");
    await expectContentError(() => publish(exec, enLoc, reviewed), "not_publishable", "cross-localization publish rejected by function");

    // approved move is atomic: pointer flips to the new reviewed revision in one call.
    const reviewed2 = await reviewedRevision(exec, "capability", { localizationId: locId, title: "t-reviewed2", description: "d" });
    await publish(exec, locId, reviewed2, reviewed);
    ok((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed2", "atomic move: pointer now on reviewed2");
    // optimistic concurrency: a stale expected-pointer is rejected as a conflict.
    await expectContentError(() => publish(exec, locId, reviewed2, reviewed), "conflict", "stale optimistic token rejected");
  }

  // ── §3 Deletion / history semantics — RESTRICT boundaries, soft-delete + archive lifecycle ──────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");
    await publish(
      exec,
      locId,
      await reviewedRevision(exec, "capability", { localizationId: locId, title: "keep", description: "d" }),
    );
    // Historical boundaries reject hard delete PREDICTABLY (FK RESTRICT → 23503), not via the trigger.
    await expectThrows(
      () => exec.query("DELETE FROM service_content_blocks WHERE id = $1", [blockId]),
      /foreign key|violates|23503/i,
      "deleting a block that has localizations/revisions is rejected (RESTRICT)",
    );
    await expectThrows(
      () => exec.query("DELETE FROM service_content_pages WHERE id = $1", [pageId]),
      /foreign key|violates|23503/i,
      "deleting a page that owns blocks is rejected (RESTRICT)",
    );
    // Supported lifecycle: disable the block, archive the page — history stays intact.
    await exec.query("UPDATE service_content_blocks SET is_active = false WHERE id = $1", [blockId]);
    await exec.query("UPDATE service_content_pages SET status = 'archived' WHERE id = $1", [pageId]);
    ok((await getPublishedBlocks(exec, "thg-fulfill", "vi")).length === 0, "disabled block is not served (soft-delete)");
    const revCount = await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_revisions");
    ok(revCount[0].n === 2, "no historical revision was removed by the lifecycle operations");
    // Empty scaffolding (no localizations) IS deletable — documented behavior.
    const emptyBlock = await createBlock(exec, { pageId, kind: "capability", blockKey: "scratch", position: 9 });
    await exec.query("DELETE FROM service_content_blocks WHERE id = $1", [emptyBlock]);
    ok(true, "empty block with no localizations can be deleted (documented cleanup path)");
  }

  // ── §1 Least-privilege runtime role — real column-level GRANTs + function-only revision path ─────
  {
    const { db, exec } = await freshDbWithRoles();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");
    const draftId = await createDraftRevision(exec, "capability", { localizationId: locId, title: "t", description: "d" });
    const reviewedId = await approveRevision(exec, draftId, 1);
    // A second, un-approved draft for the runtime approve test below.
    const draft2 = await createDraftRevision(exec, "capability", { localizationId: locId, title: "t2", description: "d" });

    const asRuntime = async (sql: string) => {
      await db.exec("SET ROLE thg_cms_runtime;");
      try {
        await db.exec(sql);
      } finally {
        await db.exec("RESET ROLE;");
      }
    };
    const denied = async (sql: string, label: string) =>
      expectThrows(() => asRuntime(sql), /permission denied|not.*allowed/i, label);
    const allowed = async (sql: string, label: string) => {
      try {
        await asRuntime(sql);
        ok(true, label);
      } catch (e) {
        ok(false, `${label} (${(e as Error).message})`);
      }
    };

    // Mutable structure columns → allowed.
    await allowed(`UPDATE content.service_content_blocks SET position = 2, is_active = false WHERE id = ${blockId}`, "runtime may UPDATE block position/is_active");
    await allowed(`UPDATE content.service_content_pages SET status = 'archived' WHERE id = ${pageId}`, "runtime may UPDATE page status");
    // Business-identity columns → denied.
    await denied(`UPDATE content.service_content_blocks SET kind = 'solution' WHERE id = ${blockId}`, "runtime may NOT UPDATE block kind");
    await denied(`UPDATE content.service_content_blocks SET block_key = 'x' WHERE id = ${blockId}`, "runtime may NOT UPDATE block_key");
    await denied(`UPDATE content.service_content_blocks SET page_id = ${pageId} WHERE id = ${blockId}`, "runtime may NOT UPDATE block page_id");
    await denied(`UPDATE content.service_content_pages SET slug = 'x' WHERE id = ${pageId}`, "runtime may NOT UPDATE page slug");
    await denied(`UPDATE content.service_content_localizations SET locale = 'en' WHERE id = ${locId}`, "runtime may NOT UPDATE localization identity");
    // Revisions: NO direct write of ANY kind — the runtime cannot fabricate a revision.
    await denied(`INSERT INTO content.service_content_revisions (localization_id, title, review_status) VALUES (${locId}, 'x', 'draft')`, "runtime may NOT INSERT a draft revision directly");
    await denied(`INSERT INTO content.service_content_revisions (localization_id, title, review_status) VALUES (${locId}, 'x', 'reviewed')`, "runtime may NOT INSERT an arbitrary reviewed revision directly");
    await denied(`UPDATE content.service_content_revisions SET title = 'x' WHERE id = ${reviewedId}`, "runtime may NOT UPDATE a revision");
    await denied(`DELETE FROM content.service_content_revisions WHERE id = ${reviewedId}`, "runtime may NOT DELETE a revision");
    // Publications: no direct write.
    await denied(`INSERT INTO content.service_content_publications (localization_id, revision_id) VALUES (${locId}, ${reviewedId})`, "runtime may NOT INSERT a publication directly");
    // The functions ARE the runtime's only write path (EXECUTE granted; definer = fn_owner).
    await allowed(`SELECT content.create_draft_revision(${locId}, 'via-fn', 'd', '{}'::jsonb, NULL, '', NULL)`, "runtime MAY create a draft via create_draft_revision");
    await allowed(`SELECT content.approve_revision(${draft2}, 1, NULL)`, "runtime MAY approve a draft via approve_revision");
    await allowed(`SELECT content.publish_revision(${locId}, ${reviewedId}, NULL, NULL)`, "runtime MAY publish via publish_revision");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  // Explicit exit — PGlite keeps a WASM handle open, so the event loop would not drain on its own.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
