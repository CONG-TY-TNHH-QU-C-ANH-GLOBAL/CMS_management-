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

    // §7: a NEW draft does not alter published content until publish moves the pointer atomically.
    const rev2 = await createRevision(exec, "journey_step", {
      localizationId: locId,
      title: "Design Input EDITED",
      description: "v2 desc",
      reviewStatus: "draft",
    });
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Design Input",
      "new draft does NOT change published content",
    );
    await publish(exec, locId, rev2);
    ok(
      (await getPublishedBlocks(exec, "thg-fulfill", "vi"))[0].title === "Design Input EDITED",
      "publish atomically moves the pointer to the new revision",
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

  console.log(`\n${passed} passed, ${failed} failed`);
  // Explicit exit — PGlite keeps a WASM handle open, so the event loop would not drain on its own.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
