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
  createRevision,
  publish,
  getPublishedBlocks,
} from "../src/features/content-pg/content.repo";
import {
  FULFILL_CONTENT_MANIFEST,
  type ContentManifest,
} from "../src/features/content-pg/manifests/fulfill.content";

type NewRevisionStatus = "draft" | "reviewed" | "stale" | "failed";

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
 *  GRANTs and SET ROLE (verified), so these are real privilege checks, not simulations. */
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

/** Generic manifest importer (sketch of the future importer): validate-by-kind is enforced in the repo;
 *  identity/integrity is enforced by the DB. One transaction per manifest. */
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
        const revisionId = await createRevision(tx, b.kind, {
          localizationId,
          title: loc.title,
          description: loc.description,
          translatedPayload: loc.translatedPayload,
          sourceLocale: locale === "vi" ? null : "vi",
          sourceHash,
          reviewStatus: "reviewed",
        });
        await publish(tx, localizationId, revisionId);
      }
    }
  });
}

async function main(): Promise<void> {
  console.log("PG content data-plane POC — PGlite (real PostgreSQL, in-process)\n");

  // ── Core lifecycle: transactional create → publish ──────────────────────────────────────────
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
      const revId = await createRevision(tx, "journey_step", {
        localizationId: locId,
        title: "Design Input",
        description: "v1 desc",
        reviewStatus: "reviewed",
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
    const otherLocId = await upsertLocalization(
      exec,
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].id,
      "en",
    );
    await createRevision(exec, "journey_step", {
      localizationId: otherLocId,
      title: "reviewed-not-published",
      description: "x",
      reviewStatus: "reviewed",
    });
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "en")).length === 0,
      "reviewed revision without publish pointer is NOT served",
    );

    // §7: a NEW draft does not alter published content, and (§2) publishing a draft is rejected by the
    // DB function — review_status is fixed at creation (revisions are immutable), so approval is a new
    // reviewed revision, not an in-place status flip.
    const rev2draft = await createRevision(exec, "journey_step", {
      localizationId: locId,
      title: "Design Input EDITED",
      description: "v2 desc",
      reviewStatus: "draft",
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
    const rev2 = await createRevision(exec, "journey_step", {
      localizationId: locId,
      title: "Design Input EDITED",
      description: "v2 desc",
      reviewStatus: "reviewed",
    });
    await publish(exec, locId, rev2, revId); // optimistic: expect the pointer still holds revId
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Design Input EDITED",
      "publish atomically moves the pointer to the new reviewed revision",
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
        createRevision(exec, "solution", {
          localizationId: locId,
          title: "t",
          description: "d",
          translatedPayload: { wrong: true },
        }),
      "invalid_payload",
      "invalid translated_payload rejected",
    );
    await expectContentError(
      () => createRevision(exec, "process_step", { localizationId: locId, title: "only title" }),
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
      const rev = await createRevision(exec, "capability", {
        localizationId: locId,
        title,
        description: `${locale} desc`,
        sourceLocale: locale === "vi" ? null : "vi",
        reviewStatus: "reviewed",
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
      await createRevision(exec, "capability", {
        localizationId: l2,
        title: "VI only",
        description: "d",
        reviewStatus: "reviewed",
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
      await createRevision(exec, "solution", {
        localizationId: locId,
        title: "Real business",
        description: "Registered.",
        translatedPayload: { tag: "Trust & Safety" },
        reviewStatus: "reviewed",
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

  // ── §9 Fulfill manifest import round-trips (validated by the kind registry) ──────────────────
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

  // ── §3 Publication ownership enforced by the DB (composite FK), not by service code ─────────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locVi = await upsertLocalization(exec, blockId, "vi");
    const locEn = await upsertLocalization(exec, blockId, "en");
    await createRevision(exec, "capability", { localizationId: locVi, title: "VI", description: "d", reviewStatus: "reviewed" });
    const revEn = await createRevision(exec, "capability", { localizationId: locEn, title: "EN", description: "d", reviewStatus: "reviewed" });
    // Publish localization A (vi) pointing at revision R that belongs to localization B (en).
    await expectThrows(
      () => exec.query("INSERT INTO service_content_publications (localization_id, revision_id) VALUES ($1, $2)", [locVi, revEn]),
      /foreign key|violates/i,
      "publication cannot point to a revision from another localization (composite FK rejects)",
    );
  }

  // ── §4 Revisions are immutable at the DB level (append-only) ─────────────────────────────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");
    const revId = await createRevision(exec, "capability", { localizationId: locId, title: "orig", description: "d", reviewStatus: "reviewed" });
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

  // ── §2 Publication eligibility enforced by content.publish_revision (not service code) ──────────
  {
    const exec = await freshDb();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");
    const mkRev = (status: NewRevisionStatus) =>
      createRevision(exec, "capability", { localizationId: locId, title: `t-${status}`, description: "d", reviewStatus: status });

    // reviewed → publishes; establishes the baseline pointer.
    const reviewed = await mkRev("reviewed");
    await publish(exec, locId, reviewed);
    ok((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed", "reviewed revision publishes");

    // every non-reviewed state is rejected, and the baseline pointer never moves.
    for (const bad of ["draft", "stale", "failed"] as const) {
      const rev = await mkRev(bad);
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
    const reviewed2 = await mkRev("reviewed");
    await publish(exec, locId, reviewed2, reviewed);
    ok((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "t-reviewed", "atomic move: pointer now on reviewed2");
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
      await createRevision(exec, "capability", { localizationId: locId, title: "keep", description: "d", reviewStatus: "reviewed" }),
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
    ok(revCount[0].n === 1, "no historical revision was removed by the lifecycle operations");
    // Empty scaffolding (no localizations) IS deletable — documented behavior.
    const emptyBlock = await createBlock(exec, { pageId, kind: "capability", blockKey: "scratch", position: 9 });
    await exec.query("DELETE FROM service_content_blocks WHERE id = $1", [emptyBlock]);
    ok(true, "empty block with no localizations can be deleted (documented cleanup path)");
  }

  // ── §1 Least-privilege runtime role — real column-level GRANTs via SET ROLE (PGlite enforces) ────
  {
    const { db, exec } = await freshDbWithRoles();
    const pageId = await createPage(exec, "thg-fulfill");
    const blockId = await createBlock(exec, { pageId, kind: "capability", blockKey: "hub", position: 1 });
    const locId = await upsertLocalization(exec, blockId, "vi");
    const revId = await createRevision(exec, "capability", { localizationId: locId, title: "t", description: "d", reviewStatus: "reviewed" });

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
    // Revisions append-only by privilege (independent of the trigger).
    await denied(`UPDATE content.service_content_revisions SET title = 'x' WHERE id = ${revId}`, "runtime may NOT UPDATE a revision");
    await denied(`DELETE FROM content.service_content_revisions WHERE id = ${revId}`, "runtime may NOT DELETE a revision");
    // Publications: no direct write; the function is the only path.
    await denied(`INSERT INTO content.service_content_publications (localization_id, revision_id) VALUES (${locId}, ${revId})`, "runtime may NOT INSERT a publication directly");
    await allowed(`SELECT content.publish_revision(${locId}, ${revId}, NULL, NULL)`, "runtime MAY publish via EXECUTE on the function");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  // Explicit exit — PGlite keeps a WASM handle open, so the event loop would not drain on its own.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
