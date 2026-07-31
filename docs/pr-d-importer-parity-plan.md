# PR-D implementation plan — controlled importer and shadow parity

**Status: NOT STARTED.** No importer code exists on any branch. This is the bounded plan, not
a claim of progress.

PR-D is deliberately not begun yet, for two reasons. It would conflict with
`feat/Anh/pg-preview-runtime-gates` (both add modules under
`src/features/content-pg/`), and half of it cannot be validated without the preview database
that does not exist. Starting it now would mean writing code that neither merges cleanly nor
runs.

---

## What the importer already has

The `content-pg` foundation on `main` covers more than a green field:

| Existing | Where | PR-D use |
| --- | --- | --- |
| Kind registry | `content.kinds.ts` | Typed kind validation |
| Public DTO shape | `content.dto.ts` | Parity comparison target |
| Bounded error codes | `content.errors.ts` | Importer error contract |
| Draft → approve → publish functions | `db/pg/migrations/0002..0004` | Transactional apply path |
| Validated Fulfill manifest | `manifests/fulfill.content.ts` | The first real input |
| PGlite harness | `scripts/pg-content-poc-selfcheck.ts` | Local proof for everything credential-free |
| Migration runner | `src/features/content-pg/migrate/` (PR-C) | Schema the importer writes into |

## Phase 1 — mergeable as soon as PR-C merges, no credentials needed

Everything here is pure types and pure functions, provable against PGlite.

| Module | Contract |
| --- | --- |
| `importer/manifest.schema.ts` | Zod schema for the versioned input: `{ version, provenance, pages[], blocks[], localizations[] }`. Rejects an unknown kind against `KIND_REGISTRY`, a duplicate `(page, kind, block_key)`, and a localization for a locale not in `content_locales`. |
| `importer/plan.types.ts` | `ImportPlan = { creates, updates, unchanged, collisions, publications }`. Every entry keyed by business identity (`page + kind + block_key + locale`), **never** a database id — an id-keyed plan is not reproducible across environments. |
| `importer/diff.ts` | Pure `(manifest, currentState) → ImportPlan`. Deterministic: same inputs, same plan, same order. Sorted by business identity so two runs diff cleanly in review. |
| `importer/collision.ts` | `CollisionReport = { identity, existingRevisionId, incomingHash, kind: "content-differs" \| "already-published" \| "unknown-kind" }`. A collision is REPORTED, never auto-resolved. |
| `importer/cli.ts` | `validate` \| `dry-run` \| `apply`. **Default is dry-run.** `apply` requires `--confirm` AND an explicit `--environment=preview`; the environment is never inferred from the connection URL. Same fail-closed host allowlist as `pg-migrate.ts`. |
| `parity/compare.types.ts` | `ParityMismatch = { identity, field, d1Value, pgValue, classification }` where classification ∈ `expected-normalization \| unexplained \| missing-in-d1 \| missing-in-pg`. |
| `parity/compare.ts` | Pure `(d1Dto, pgDto) → ParityMismatch[]` over page identity, kind, block key, ordering, lifecycle, locale, title, description, payload and serialized public DTO. Counts are diagnostic only; identity-level mismatches are the result. |
| `parity/report.ts` | Machine-readable JSONL + a human summary. Zero unexplained mismatches is the cutover gate. |
| `order-keys/inventory.types.ts` | `OrderKeyProposal = { d1BlockId, page, kind, position, recognitionTitle, proposedBlockKey, rationale, collisionStatus }`. |
| `order-keys/extract.ts` | Reads the controlled fixture `db/seeds/order-service-blocks.sql` — **not** production. Proposes semantic keys from content, never from position or a translated title alone. |

Tests for all of the above run against PGlite exactly like `check:pg-content-poc` does today.

**Explicitly NOT in phase 1:** any remote connection, any write outside PGlite, any production
read, and the THG Order key *approval* — the extractor proposes, a human approves.

## Phase 2 — requires the real preview gate

Blocked until `bun run gate:pg-concurrency` passes (see `db/pg/OWNER_HANDOFF.md`).

| Work | Why it needs the real environment |
| --- | --- |
| Importer `apply` against preview | Transactional apply, idempotent rerun and no-partial-publication are only meaningful against a real server. PGlite is one session and cannot show a concurrent importer. |
| Fulfill manifest end-to-end | Proving the import produces the exact approved DTOs needs the schema actually applied. |
| Parity harness on real data | Needs a preview database holding imported content to compare against a controlled D1 export. |
| Order key apply | Owner review of the proposal precedes any write. |

## Sequencing

```
PR-C merges
   └─▶ PR-D phase 1  (types, diff, dry-run, parity comparison, key extraction)   ← startable immediately
          └─▶ owner provisions preview  ──▶ gate:pg-concurrency passes
                 └─▶ PR-D phase 2  (remote dry-run, then confirmed apply)
                        └─▶ zero unexplained parity mismatches
                               └─▶ cutover readiness review (separate owner approval)
```

## Guardrails that do not move

- Dry-run is the default in every mode and every environment.
- `apply` never infers the target from the connection URL; it requires an explicit environment
  flag and a confirmation flag.
- No production D1 read, no production PostgreSQL write, no production content import.
- Business copy is never edited by the importer except to correct a validated manifest defect.
- Counts are diagnostic; a parity pass means zero **unexplained** identity-level mismatches.
