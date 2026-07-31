// POC self-check for the PostgreSQL content data plane. Runs REAL PostgreSQL in-process (PGlite) —
// no server, no cloud creds — and proves the vertical slice end-to-end. Standalone, matching the CMS
// self-check convention:  bun run scripts/pg-content-poc-selfcheck.ts   (exit non-zero on any failure).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

// ── Callback-based check runner (no boolean-selector helper) ──────────────────────────────────────
let passed = 0;
let failed = 0;
/** Run one named check. It passes unless the callback throws (assertion or unexpected error). */
async function runCheck(label: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Domain-specific negative assertions (meaningful diagnostics), all callback-based.
const isContentError = (code: ContentErrorCode) => (e: unknown) =>
  e instanceof ContentError && e.code === code;
const errCode = (e: unknown): string | undefined => (e as { code?: string })?.code;
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const SQLSTATE_PERMISSION_DENIED = "42501";
const isPermissionDenied = (e: unknown): boolean =>
  errCode(e) === SQLSTATE_PERMISSION_DENIED ||
  (errCode(e) === undefined && /permission denied/i.test(errMsg(e))); // narrow message fallback only
const isConstraintViolation = (e: unknown): boolean =>
  errCode(e) === "23503" ||
  errCode(e) === "23505" ||
  /foreign key|violates|duplicate key/i.test(errMsg(e));
const isImmutableRejection = (e: unknown): boolean => /append-only|immutable/i.test(errMsg(e));

const expectContentError = (fn: () => Promise<unknown>, code: ContentErrorCode, label: string) =>
  runCheck(label, () => assert.rejects(fn, isContentError(code)));
const expectNotPublishable = (fn: () => Promise<unknown>, label: string) =>
  expectContentError(fn, "not_publishable", label);
const expectConflict = (fn: () => Promise<unknown>, label: string) =>
  expectContentError(fn, "conflict", label);
const expectValidationError = (fn: () => Promise<unknown>, code: ContentErrorCode, label: string) =>
  expectContentError(fn, code, label);
const expectPermissionDenied = (fn: () => Promise<unknown>, label: string) =>
  runCheck(label, () => assert.rejects(fn, isPermissionDenied));
const expectConstraintViolation = (fn: () => Promise<unknown>, label: string) =>
  runCheck(label, () => assert.rejects(fn, isConstraintViolation));
const expectImmutableRejection = (fn: () => Promise<unknown>, label: string) =>
  runCheck(label, () => assert.rejects(fn, isImmutableRejection));

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
const LOCALE_META = {
  vi: { nativeName: "Tiếng Việt", isSource: true },
  en: { nativeName: "English", isSource: false },
  zh: { nativeName: "中文", isSource: false },
} as const;
type SeedLocale = keyof typeof LOCALE_META;

/** Seed locales active AND at public rollout (so getPublishedBlocks serves them). */
async function seedLocales(exec: PgExec, locales: readonly SeedLocale[]): Promise<void> {
  for (const code of locales) {
    await upsertLocale(exec, {
      code,
      nativeName: LOCALE_META[code].nativeName,
      isActive: true,
      isSource: LOCALE_META[code].isSource,
      rolloutStatus: "public",
    });
  }
}

/** Apply the ORDERED migration set (0001..0005), one file per concern, in sorted filename order. */
async function applyMigrations(db: PGlite): Promise<void> {
  const dir = fileURLToPath(new URL("../db/pg/migrations/", import.meta.url));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
}

/** Scoped fresh DB — the PGlite instance is always closed, never leaked to process exit. */
async function withFreshDb(
  body: (ctx: { db: PGlite; exec: PgExec }) => Promise<void>,
): Promise<void> {
  const db = new PGlite();
  try {
    await applyMigrations(db);
    await db.exec("SET search_path TO content, public;");
    const exec = pgliteExec(db);
    await seedLocales(exec, ["vi", "en", "zh"]);
    await body({ db, exec });
  } finally {
    await db.close();
  }
}

/** Like withFreshDb but ALSO applies the real role/privilege bootstrap (for SET ROLE privilege tests). */
async function withFreshDbWithRoles(
  body: (ctx: { db: PGlite; exec: PgExec }) => Promise<void>,
): Promise<void> {
  const db = new PGlite();
  try {
    await applyMigrations(db);
    await db.exec(
      readFileSync(
        fileURLToPath(new URL("../db/pg/bootstrap/0001_roles_and_privileges.sql", import.meta.url)),
        "utf8",
      ),
    );
    await db.exec("SET search_path TO content, public;");
    const exec = pgliteExec(db);
    await seedLocales(exec, ["vi", "en"]);
    await body({ db, exec });
  } finally {
    await db.close();
  }
}

/** Create a page + one block + one localization in one step (the common "arrange"). */
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

/** Number of blocks getPublishedBlocks serves for a page/locale. */
async function servedCount(exec: PgExec, slug: string, locale: string): Promise<number> {
  return (await getPublishedBlocks(exec, slug, locale)).length;
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
  await withFreshDb(async ({ exec }) => {
    const { pageId, locId, revId } = await exec.tx(async (tx) => {
      const seeded = await seedLocalizedBlock(tx, {
        kind: "journey_step",
        blockKey: "design-input",
      });
      const rev = await publishReviewed(tx, "journey_step", seeded.locId, {
        localizationId: seeded.locId,
        title: "Design Input",
        description: "v1 desc",
      });
      return { pageId: seeded.pageId, locId: seeded.locId, revId: rev };
    });
    await runCheck("transactional create → 1 published VI block", async () => {
      const blocks = await getPublishedBlocks(exec, "thg-fulfill", "vi");
      assert.ok(pageId > 0 && blocks.length === 1 && blocks[0].title === "Design Input");
    });

    // reviewed != published — an extra reviewed revision that is NOT the pointer is not served.
    const blockId = (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].id;
    const otherLocId = await upsertLocalization(exec, blockId, "en");
    await reviewedRevision(exec, "journey_step", {
      localizationId: otherLocId,
      title: "reviewed-not-published",
      description: "x",
    });
    await runCheck("reviewed revision without publish pointer is NOT served", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "en"), 0),
    );

    // a NEW draft does not alter published content, and publishing a draft is rejected by the DB.
    const rev2draft = await createDraftRevision(exec, "journey_step", {
      localizationId: locId,
      title: "Design Input EDITED",
      description: "v2 desc",
    });
    await runCheck("new draft does NOT change published content", async () =>
      assert.equal((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title, "Design Input"),
    );
    await expectNotPublishable(
      () => publish(exec, locId, rev2draft),
      "publishing a draft revision is rejected by content.publish_revision",
    );
    await runCheck("rejected publish leaves the current published revision unchanged", async () =>
      assert.equal((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title, "Design Input"),
    );
    const rev2 = await approveRevision(exec, rev2draft, 1);
    await publish(exec, locId, rev2, revId); // optimistic: expect the pointer still holds revId
    await runCheck("publish atomically moves the pointer to the approved revision", async () =>
      assert.equal(
        (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title,
        "Design Input EDITED",
      ),
    );
    await runCheck("revisions are append-only (distinct ids)", () => assert.notEqual(revId, rev2));
  });

  // ── DB-enforced identity + registry validation ──────────────────────────────────────────────
  await withFreshDb(async ({ exec }) => {
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
  });

  // ── VI/EN/ZH symmetry + locale isolation + no cross-fallback ────────────────────────────────
  await withFreshDb(async ({ exec }) => {
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
    await runCheck("VI resolves its own published revision (VI is a normal locale)", async () =>
      assert.equal((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title, "Hub VI"),
    );
    await runCheck("ZH resolves its own published revision (symmetric model)", async () =>
      assert.equal((await getPublishedBlocks(exec, "thg-fulfill", "zh"))[0].title, "Hub ZH"),
    );
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
    await runCheck("VI sees both blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 2),
    );
    await runCheck("EN omits the VI-only block (no cross-fallback)", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "en"), 1),
    );
  });

  // ── Published read lifecycle — page status + locale is_active/rollout filters ────────────────
  await withFreshDb(async ({ exec }) => {
    const { pageId, blockId, locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    await publishReviewed(exec, "capability", locId, {
      localizationId: locId,
      title: "Served",
      description: "d",
    });
    const setPage = (status: string) =>
      exec.query(
        `UPDATE service_content_pages SET status = $2::content.page_status WHERE id = $1`,
        [pageId, status],
      );
    const setLocale = (isActive: boolean, rollout: "planned" | "preview" | "public" | "retired") =>
      upsertLocale(exec, {
        code: "vi",
        nativeName: "Tiếng Việt",
        isActive,
        isSource: true,
        rolloutStatus: rollout,
      });

    await runCheck("published page + public active locale returns blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 1),
    );
    await setPage("archived");
    await runCheck("archived page returns no blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
    await setPage("draft");
    await runCheck("draft page returns no blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
    await setPage("published");
    await setLocale(false, "public");
    await runCheck("inactive locale returns no blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
    await setLocale(true, "preview");
    await runCheck("preview locale returns no blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
    await setLocale(true, "planned");
    await runCheck("planned locale returns no blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
    await setLocale(true, "retired");
    await runCheck("retired locale returns no blocks", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
    await setLocale(true, "public");
    await runCheck("missing locale returns no cross-locale fallback", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "en"), 0),
    );
    await exec.query("UPDATE service_content_blocks SET is_active = false WHERE id = $1", [
      blockId,
    ]);
    await runCheck("disabled block remains excluded", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
  });

  // ── DTO compatibility + shadow-read parity (D1-V1 fixture vs PG compat DTO) ───────────────────
  await withFreshDb(async ({ exec }) => {
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
    const v1Dto = {
      kind: "solution",
      position: 1,
      icon: "🛡️",
      title: "Real business",
      description: "Registered.",
      payload: { tag: "Trust & Safety" },
    };
    await runCheck("shadow parity: kind/position/icon/title/description match V1", () => {
      assert.equal(pgDto.kind, v1Dto.kind);
      assert.equal(pgDto.position, v1Dto.position);
      assert.equal(pgDto.icon, v1Dto.icon);
      assert.equal(pgDto.title, v1Dto.title);
      assert.equal(pgDto.description, v1Dto.description);
    });
    await runCheck("shadow parity: order payload.tag matches V1", () =>
      assert.equal(pgDto.payload.tag, v1Dto.payload.tag),
    );
    await runCheck("Fulfill contract: payload.key === block_key (identity preserved)", () => {
      assert.equal(pgDto.block_key, "trust");
      assert.equal(pgDto.payload.key, "trust");
    });
  });

  // ── Fulfill manifest import round-trips (draft → approve → publish per locale) ────────────────
  await withFreshDb(async ({ exec }) => {
    await importManifest(exec, FULFILL_CONTENT_MANIFEST);
    for (const locale of ["vi", "en", "zh"] as const) {
      await runCheck(`manifest import: 14 published blocks resolve for ${locale}`, async () =>
        assert.equal(await servedCount(exec, "thg-fulfill", locale), 14),
      );
    }
    const vi = await getPublishedBlocks(exec, "thg-fulfill", "vi");
    await runCheck("manifest: section_copy title/NULL description preserved", () => {
      const heading = vi.find((b) => b.block_key === "consult-heading");
      assert.ok(heading?.title === "Mở hồ sơ vận hành." && heading?.description === null);
    });
    await runCheck("manifest: every DTO carries payload.key = block_key", () =>
      assert.ok(vi.every((b) => toPublicDto(b).payload.key === b.block_key)),
    );
  });

  // ── Publication ownership enforced by the DB (composite FK), not by service code ─────────────
  await withFreshDb(async ({ exec }) => {
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
    await expectConstraintViolation(
      () =>
        exec.query(
          "INSERT INTO service_content_publications (localization_id, revision_id) VALUES ($1, $2)",
          [locVi, revEn],
        ),
      "publication cannot point to a revision from another localization (composite FK rejects)",
    );
  });

  // ── Revisions are immutable at the DB level (append-only) ────────────────────────────────────
  await withFreshDb(async ({ exec }) => {
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
  });

  // ── Review provenance + approval conflict (PT409) ────────────────────────────────────────────
  await withFreshDb(async ({ exec }) => {
    const { blockId, locId } = await seedLocalizedBlock(exec, {
      pageSlug: "thg-order",
      kind: "solution",
      blockKey: "hub",
      locale: "vi",
    });
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
    await runCheck("create_draft_revision always creates a draft", () =>
      assert.equal(draftRow.review_status, "draft"),
    );
    await runCheck("a draft carries no review lineage", () =>
      assert.equal(draftRow.reviewed_from_revision_id, null),
    );

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
        `SELECT title, description, translated_payload, source_hash, review_status, reviewed_from_revision_id, reviewed_by, reviewed_at
          FROM service_content_revisions WHERE id = $1`,
        [reviewedId],
      )
    )[0];
    await runCheck(
      "approve_revision copies the EXACT draft content + preserves source_hash provenance",
      () => {
        assert.equal(rev.review_status, "reviewed");
        assert.equal(rev.title, "Hub");
        assert.equal(rev.description, "desc");
        assert.deepEqual(rev.translated_payload, { tag: "T" });
        assert.equal(rev.source_hash, "hash-123");
      },
    );
    await runCheck("reviewed revision records reviewed_from_revision_id = the draft", () =>
      assert.equal(rev.reviewed_from_revision_id, draftId),
    );
    await runCheck("reviewed revision records reviewer + reviewed_at", () =>
      assert.ok(rev.reviewed_by === 42 && rev.reviewed_at !== null),
    );

    // Second approval of the same draft → a workflow CONFLICT (PT409), not duplicate_identity, and it
    // does NOT create another reviewed revision.
    const reviewedBefore = (
      await exec.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM service_content_revisions WHERE review_status = 'reviewed'",
      )
    )[0].n;
    await expectConflict(
      () => approveRevision(exec, draftId, 42),
      "second approval of the same draft returns conflict (PT409)",
    );
    const reviewedAfter = (
      await exec.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM service_content_revisions WHERE review_status = 'reviewed'",
      )
    )[0].n;
    await runCheck("second approval did not create another reviewed revision", () =>
      assert.equal(reviewedBefore, reviewedAfter),
    );

    // An already-reviewed revision is not itself reviewable; nor is a missing revision.
    await expectNotPublishable(
      () => approveRevision(exec, reviewedId, 1),
      "approving an already-reviewed revision is rejected",
    );
    await expectNotPublishable(
      () => approveRevision(exec, 999999, 1),
      "approving a missing revision is rejected",
    );

    // Cross-localization lineage is impossible (composite FK).
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
          [locId, enDraft],
        ),
      "cross-localization review lineage is rejected by the composite FK",
    );

    // An UNRELATED unique violation (duplicate block identity) is still duplicate_identity, not conflict.
    const pageId = (
      await exec.query<{ id: number }>(
        "SELECT page_id AS id FROM service_content_blocks WHERE id = $1",
        [blockId],
      )
    )[0].id;
    await createBlock(exec, { pageId, kind: "solution", blockKey: "dup", position: 3 });
    await expectValidationError(
      () => createBlock(exec, { pageId, kind: "solution", blockKey: "dup", position: 4 }),
      "duplicate_identity",
      "an unrelated unique violation is classified duplicate_identity, not conflict",
    );

    await publish(exec, locId, reviewedId);
    await runCheck("an approved revision publishes successfully", async () =>
      assert.equal((await getPublishedBlocks(exec, "thg-order", "vi"))[0].title, "Hub"),
    );
  });

  // ── Publication eligibility + compare-and-swap concurrency ────────────────────────────────────
  await withFreshDb(async ({ exec }) => {
    const { blockId, locId } = await seedLocalizedBlock(exec, {
      kind: "capability",
      blockKey: "hub",
      locale: "vi",
    });
    const reviewed = await publishReviewed(exec, "capability", locId, {
      localizationId: locId,
      title: "t-reviewed",
      description: "d",
    });
    await runCheck("reviewed revision publishes", async () =>
      assert.equal((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title, "t-reviewed"),
    );

    // a draft is not publishable, and the baseline pointer never moves.
    const draft = await createDraftRevision(exec, "capability", {
      localizationId: locId,
      title: "t-draft",
      description: "d",
    });
    await expectNotPublishable(() => publish(exec, locId, draft), "draft revision is rejected");
    await runCheck("published pointer unchanged after rejected draft publish", async () =>
      assert.equal((await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title, "t-reviewed"),
    );

    // cross-localization publish stays rejected through the function too.
    const enLoc = await upsertLocalization(exec, blockId, "en");
    await expectNotPublishable(
      () => publish(exec, enLoc, reviewed),
      "cross-localization publish rejected by function",
    );

    // compare-and-swap: two first-publishes (expected none) can't both win; two republishes with the
    // same expected pointer can't both win; loser gets conflict; pointer ends on exactly one revision.
    await withFreshDb(async ({ exec: e2 }) => {
      const { locId: L } = await seedLocalizedBlock(e2, {
        kind: "capability",
        blockKey: "hub",
        locale: "vi",
      });
      const r1 = await reviewedRevision(e2, "capability", {
        localizationId: L,
        title: "r1",
        description: "d",
      });
      const r2 = await reviewedRevision(e2, "capability", {
        localizationId: L,
        title: "r2",
        description: "d",
      });
      await publish(e2, L, r1);
      await expectConflict(
        () => publish(e2, L, r2),
        "two first-publishes (expected none) cannot both succeed — loser gets conflict",
      );
      await runCheck("rejected first-publish does not alter the winner", async () =>
        assert.equal((await getPublishedBlocks(e2, "thg-fulfill", "vi"))[0].title, "r1"),
      );
      await publish(e2, L, r2, r1);
      await expectConflict(
        () => publish(e2, L, r1, r1),
        "two republishes with the same expected pointer cannot both succeed — loser gets conflict",
      );
      await runCheck("the pointer ends on exactly one approved revision", async () => {
        const served = await getPublishedBlocks(e2, "thg-fulfill", "vi");
        assert.ok(served.length === 1 && served[0].title === "r2");
      });
    });
  });

  // ── Block optimistic version — trigger-maintained, never caller-assignable ────────────────────
  await withFreshDb(async ({ exec }) => {
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
    await runCheck("a new block starts at version 1", async () =>
      assert.equal(await versionOf(), 1),
    );
    await exec.query("UPDATE service_content_blocks SET position = position + 1 WHERE id = $1", [
      blockId,
    ]);
    await runCheck("a mutable structure change bumps version by exactly one", async () =>
      assert.equal(await versionOf(), 2),
    );
    await exec.query("UPDATE service_content_blocks SET position = position WHERE id = $1", [
      blockId,
    ]);
    await runCheck("a no-op update does not bump version", async () =>
      assert.equal(await versionOf(), 2),
    );
    await exec.query("UPDATE service_content_blocks SET version = 99, icon = 'x' WHERE id = $1", [
      blockId,
    ]);
    const curV = await versionOf();
    await runCheck("a caller-supplied version is ignored; the trigger bumps to 3", () =>
      assert.equal(curV, 3),
    );
    const draft = await createDraftRevision(exec, "capability", {
      localizationId: locId,
      title: "v",
      description: "d",
    });
    await expectConflict(
      () => approveRevision(exec, draft, 1, curV - 1),
      "approve with a stale expected block version is rejected",
    );
    await runCheck("approve with the correct expected block version succeeds", async () =>
      assert.ok((await approveRevision(exec, draft, 1, curV)) > 0),
    );
  });

  // ── Least-privilege runtime role — column grants + function-only writes (SET ROLE) ────────────
  await withFreshDbWithRoles(async ({ db, exec }) => {
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
    const allowed = (sql: string, label: string) => runCheck(label, () => asRuntime(sql));

    await allowed(
      `UPDATE content.service_content_blocks SET position = 2, is_active = false WHERE id = ${blockId}`,
      "runtime may UPDATE block position/is_active",
    );
    await allowed(
      `UPDATE content.service_content_pages SET status = 'archived' WHERE id = ${pageId}`,
      "runtime may UPDATE page status",
    );
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
    // upsertLocalization conflict path succeeds with runtime privileges (INSERT + SELECT, no UPDATE).
    await runCheck(
      "runtime upsertLocalization conflict path returns the existing id (no UPDATE needed)",
      async () => {
        await db.exec("SET ROLE thg_cms_runtime;");
        try {
          await db.query(
            `INSERT INTO content.service_content_localizations (block_id, locale) VALUES (${blockId}, 'vi') ON CONFLICT (block_id, locale) DO NOTHING`,
          );
          const r = await db.query<{ id: number }>(
            `SELECT id FROM content.service_content_localizations WHERE block_id = ${blockId} AND locale = 'vi'`,
          );
          assert.ok(r.rows.length === 1 && r.rows[0].id === locId);
        } finally {
          await db.exec("RESET ROLE;");
        }
      },
    );
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
    await denied(
      `INSERT INTO content.service_content_publications (localization_id, revision_id) VALUES (${locId}, ${reviewedId})`,
      "runtime may NOT INSERT a publication directly",
    );
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
  });

  // ── Deletion / history semantics — RESTRICT boundaries, soft-delete + archive lifecycle ──────
  await withFreshDb(async ({ exec }) => {
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
    await expectConstraintViolation(
      () => exec.query("DELETE FROM service_content_blocks WHERE id = $1", [blockId]),
      "deleting a block that has localizations/revisions is rejected (RESTRICT)",
    );
    await expectConstraintViolation(
      () => exec.query("DELETE FROM service_content_pages WHERE id = $1", [pageId]),
      "deleting a page that owns blocks is rejected (RESTRICT)",
    );
    await exec.query("UPDATE service_content_blocks SET is_active = false WHERE id = $1", [
      blockId,
    ]);
    await exec.query("UPDATE service_content_pages SET status = 'archived' WHERE id = $1", [
      pageId,
    ]);
    await runCheck("disabled block is not served (soft-delete)", async () =>
      assert.equal(await servedCount(exec, "thg-fulfill", "vi"), 0),
    );
    await runCheck("no historical revision was removed by the lifecycle operations", async () =>
      assert.equal(
        (
          await exec.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM service_content_revisions",
          )
        )[0].n,
        2,
      ),
    );
    const emptyBlock = await createBlock(exec, {
      pageId,
      kind: "capability",
      blockKey: "scratch",
      position: 9,
    });
    await runCheck(
      "empty block with no localizations can be deleted (documented cleanup path)",
      async () => {
        await exec.query("DELETE FROM content.service_content_blocks WHERE id = $1", [emptyBlock]);
        const remaining = await exec.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM content.service_content_blocks WHERE id = $1",
          [emptyBlock],
        );
        assert.equal(remaining[0].n, 0);
      },
    );
  });

  // ── Bootstrap ownership transfer under a NON-superuser migration operator ─────────────────────
  {
    const db = new PGlite();
    try {
      await db.exec("CREATE ROLE mig_op NOSUPERUSER NOBYPASSRLS CREATEROLE;");
      await db.exec("CREATE SCHEMA content AUTHORIZATION mig_op;");
      await db.exec("SET ROLE mig_op;");
      try {
        await db.exec("CREATE ROLE fn_owner_t NOLOGIN NOSUPERUSER;");
        await db.exec("CREATE FUNCTION content.demo() RETURNS int LANGUAGE sql AS 'SELECT 1';");
        await db.exec("GRANT fn_owner_t TO CURRENT_USER;");
        await db.exec("GRANT CREATE ON SCHEMA content TO fn_owner_t;");
        await db.exec("ALTER FUNCTION content.demo() OWNER TO fn_owner_t;");
        await db.exec("REVOKE CREATE ON SCHEMA content FROM fn_owner_t;");
        await db.exec("REVOKE fn_owner_t FROM CURRENT_USER;");
        const owner = await db.query<{ o: string }>(
          "SELECT pg_get_userbyid(proowner) AS o FROM pg_proc WHERE proname = 'demo'",
        );
        await runCheck(
          "non-superuser operator transfers SECURITY DEFINER ownership to the NOLOGIN fn-owner",
          () => assert.equal(owner.rows[0].o, "fn_owner_t"),
        );
      } finally {
        await db.exec("RESET ROLE;");
      }
    } finally {
      await db.close();
    }
  }

  // ── Smoke write-path rollback proof — the exact runtime-smoke unit, deterministic ─────────────
  await withFreshDb(async ({ exec }) => {
    const pagesBefore = (
      await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_pages")
    )[0].n;
    const checks = await runDisposableWritePath(exec);
    await runCheck("smoke write-path: all in-transaction checks pass", () =>
      assert.ok(checks.length >= 5 && checks.every((c) => c.startsWith("✓"))),
    );
    await runCheck(
      "smoke write-path rolls back — no page/block/revision fixture survives",
      async () => {
        const pagesAfter = (
          await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_pages")
        )[0].n;
        const blocks = (
          await exec.query<{ n: number }>("SELECT count(*)::int AS n FROM service_content_blocks")
        )[0].n;
        const revs = (
          await exec.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM service_content_revisions",
          )
        )[0].n;
        assert.ok(pagesBefore === pagesAfter && blocks === 0 && revs === 0);
      },
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
}

// Top-level await with an explicit error boundary. All PGlite instances are closed in their scopes, so
// the event loop can drain; exit explicitly to preserve the non-zero code on any failure.
try {
  await main();
  process.exit(failed > 0 ? 1 : 0);
} catch (e) {
  if (e instanceof ContentError) console.error(`ContentError[${e.code}]: ${e.message}`);
  else if (e instanceof Error) console.error(`${e.name}: ${e.message}`);
  else console.error("Non-error thrown:", typeof e);
  process.exit(1);
}
