// The disposable write path exercised by the runtime smoke. Extracted so it can run BOTH against a real
// Supabase preview branch (scripts/pg-runtime-smoke.ts) AND deterministically against PGlite (the POC
// self-check, for a rollback proof). It runs entirely inside ONE transaction and ends with an
// intentional rollback sentinel, so NO fixture survives — on success OR failure. It never
// destructively deletes immutable revision history; the whole unit is simply rolled back.
import type { PgExec } from "../src/features/content-pg/pg-adapter";
import { ContentError } from "../src/features/content-pg/content.errors";
import {
  upsertPage,
  createBlock,
  upsertLocalization,
  createDraftRevision,
  approveRevision,
  publish,
} from "../src/features/content-pg/content.repo";

/** Thrown to force the single wrapping transaction to roll back once all checks have passed. */
export class RollbackSentinel extends Error {
  constructor() {
    super("smoke-rollback-sentinel");
    this.name = "RollbackSentinel";
  }
}

/** Run the full disposable content write path inside one rollbackable transaction. Returns the passed
 *  check labels. Throws if any check fails (the transaction still rolls back). */
export async function runDisposableWritePath(exec: PgExec): Promise<string[]> {
  const checks: string[] = [];
  const record = (cond: boolean, label: string): void => {
    checks.push(`${cond ? "✓" : "✗"} ${label}`);
    if (!cond) throw new Error(`smoke check failed: ${label}`);
  };

  try {
    await exec.tx(async (tx) => {
      const slug = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const pageId = await upsertPage(tx, slug);
      const blockId = await createBlock(tx, {
        pageId,
        kind: "capability",
        blockKey: "k",
        position: 1,
        coreConfig: {},
      });
      const locId = await upsertLocalization(tx, blockId, "en");
      const draft = await createDraftRevision(tx, "capability", {
        localizationId: locId,
        title: "wip",
        description: "d",
      });
      const reviewed = await approveRevision(tx, draft, 1);

      const lineage = await tx.query<{ rf: number | null }>(
        "SELECT reviewed_from_revision_id AS rf FROM content.service_content_revisions WHERE id = $1",
        [reviewed],
      );
      record(
        reviewed !== draft && lineage[0].rf === draft,
        "reviewed revision differs from and links to the draft",
      );

      await publish(tx, locId, reviewed);
      const pointerAfterPublish = await tx.query<{ r: number }>(
        "SELECT revision_id AS r FROM content.service_content_publications WHERE localization_id = $1",
        [locId],
      );
      record(
        pointerAfterPublish[0].r === reviewed,
        "publication pointer equals the reviewed revision",
      );

      // Publishing the draft must be rejected — run it in a nested savepoint so the outer tx survives.
      let draftRejected: ContentError | null = null;
      try {
        await tx.tx(async (sp) => publish(sp, locId, draft, reviewed));
      } catch (e) {
        draftRejected = e instanceof ContentError ? e : null;
      }
      record(
        draftRejected?.code === "not_publishable",
        "publishing the draft is rejected (not_publishable)",
      );
      const pointerAfterReject = await tx.query<{ r: number }>(
        "SELECT revision_id AS r FROM content.service_content_publications WHERE localization_id = $1",
        [locId],
      );
      record(
        pointerAfterReject[0].r === reviewed,
        "pointer remains the reviewed revision after the rejected publish",
      );

      // Duplicate identity → exact ContentError code (nested savepoint keeps the outer tx alive).
      let dup: ContentError | null = null;
      try {
        await tx.tx(async (sp) =>
          createBlock(sp, {
            pageId,
            kind: "capability",
            blockKey: "k",
            position: 2,
            coreConfig: {},
          }),
        );
      } catch (e) {
        dup = e instanceof ContentError ? e : null;
      }
      record(
        dup?.code === "duplicate_identity",
        "duplicate identity raises ContentError:duplicate_identity",
      );

      // All checks passed — roll the whole disposable unit back so nothing survives.
      throw new RollbackSentinel();
    });
  } catch (e) {
    if (e instanceof RollbackSentinel) return checks; // expected: transaction rolled back
    throw e;
  }
  throw new Error("smoke write path committed unexpectedly (rollback sentinel did not fire)");
}
