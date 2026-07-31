# Service Content → PostgreSQL: connection, migration & cutover plan

Companion to `docs/adr/0001-postgres-content-data-plane.md`. Nothing here has been applied to
production; the POC runs only against local PGlite.

## Connection architecture (Worker → Hyperdrive → Supabase)

```text
CMS Admin UI ──auth──▶ Worker API ──▶ content service ──▶ repository ──▶ PgExec
                                                                          │
                                          Cloudflare Hyperdrive (pooled) ─┘──▶ Supabase Postgres
                                                                                (role: thg_cms_runtime)
```

- Driver: **postgres.js** (`postgres`), Workers-compatible (`nodejs_compat` is already enabled).
- Adapter: `src/features/content-pg/pg-adapter.ts` — a narrow `PgExec` port. The client is created
  **inside the Worker request handler** via `createRequestPgScope(env)` and passed through
  services/repositories; it is closed in `finally`. **Module/isolate-level client caching is
  prohibited** (a Cloudflare I/O object must not be reused across requests) — **Hyperdrive owns
  cross-request pooling**. `max:1`, `prepare:true`, bounded `connect_timeout`/`idle_timeout` +
  `statement_timeout`/`idle_in_transaction_session_timeout`; `healthCheck()` reveals no secrets;
  failures map to `ContentError('db_unavailable')`. No connection string is ever logged.
- **Wrangler binding (NOT added to production in this POC):**
  ```jsonc
  // wrangler.jsonc — add when the Supabase project + Hyperdrive config exist
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<hyperdrive-config-id>" }]
  ```
  Local/dev uses `DATABASE_URL` (never a production secret). Roles + privileges: `db/pg/bootstrap/0001_roles_and_privileges.sql` (cluster-level; run after the migrations by the migration owner).

## Postgres migration runner — NOT implemented in this PR (Phase-2 acceptance criteria)

D1’s `wrangler d1 migrations` does not apply to Postgres. **No migration runner exists on this branch**
and one is deliberately **not** created here — this foundation PR is dormant. The runner
(`scripts/pg-migrate.ts`, `postgres.js`) is a mandatory Phase-2 deliverable and MUST satisfy:

- applies `db/pg/migrations/*.sql` in sorted order and records applied files in a `schema_migrations`
  table;
- connects **directly** to Postgres (NOT through Hyperdrive), using the migration-owner role;
- serializes concurrent runners with a **session-level advisory lock** (`pg_advisory_lock` on one
  reserved physical session) acquired **before** migration discovery / `schema_migrations` reads and
  **held across all pending applications**, released in `finally` and automatically on session death —
  a lock table row is NOT acceptable (it can be created concurrently);
- bounded lock/statement timeout;
- a **single migration-owner CI job** (no parallel appliers);
- a **concurrent-start integration test** on a real (preview) Postgres proving two runners may start,
  only one applies each migration, the other waits/exits per policy, `schema_migrations` has exactly one
  row per migration, and a failure releases the lock.

PGlite is single-connection and **cannot** prove multi-session advisory locking; the POC applies the
schema in-process only as a **shape** proof. Real serialization is proven by the preview-Postgres
integration gate above, not claimed here.

## Staged migration (additive, reversible — one writable source of truth after cutover)

| Phase | Action                                                                                        | Migrations / modules                                                                                              | Invariant                                 | Rollback                                              | Gate                                              |
| ----- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| 1     | PG schema, no runtime change                                                                  | `db/pg/migrations/0001..0005` (schema, functions, triggers) + `db/pg/bootstrap` (roles/privileges), kind registry | additive; no read/write path touches PG   | drop new schema                                       | migrations apply; POC green                       |
| 2     | Importer + curated manifests (Order **block_key** scheme decided), dry-run + collision report | `content.importer.ts`, `manifests/*`                                                                              | import is one tx; DB rejects dup identity | none (no prod read)                                   | dry-run diff reviewed                             |
| 3     | V1 D1 → PG lossless sync — select & enforce EXACTLY ONE strategy (see below)                  | one-off sync job                                                                                                  | no lost writes                            | replay from D1                                        | row-level comparison, zero unexplained mismatches |
| 4     | Shadow-read parity (fixtures/controlled data only — **no prod shadow traffic**)               | shadow harness (POC already compares V1 vs PG DTO)                                                                | DTO/order identical                       | n/a                                                   | zero diffs                                        |
| 5     | Public read cutover behind a flag                                                             | route reads PG via compat mapper                                                                                  | contract byte-stable                      | flip flag → D1                                        | row-level comparison gate below passes            |
| 6     | Admin writes + publishing cutover                                                             | admin service_fns → PG                                                                                            | reviewed≠published preserved              | flip flag → D1 (dual-write only if evidence requires) | write parity                                      |
| 7     | Disable V1 writes; rollback window; later drop D1 content tables                              | cleanup                                                                                                           | single source of truth                    | restore from backup within window                     | stability window elapsed                          |

## Cutover gate (Phase 3 → read cutover) — counts are diagnostic only, never authorization

**Phase 3 must select and enforce EXACTLY ONE lossless synchronization strategy** (not left implicit at
cutover): (a) owner-approved write freeze, (b) change-data-capture / replay, or (c) bounded dual-write.

**Before read cutover**, a deterministic **row-level** comparison of D1 vs PG must pass — matching
row/record COUNTS alone must NEVER pass the gate. It compares, per record:

- page identity + slug; page status/lifecycle;
- block page/kind/block_key identity; position; active state;
- locale identity + lifecycle (is_active, rollout_status);
- localization identity;
- revision number / review status / source linkage; `source_revision_id`; `source_hash` + hash version;
- publication pointer; relevant optimistic versions (block `version`);
- the public DTO projection **and its order**.

**Gate:** zero unexplained mismatches. Any mismatch blocks cutover until explained or resolved.

## Fulfill content preservation & PR #70

The 14 low-risk Fulfill roles are preserved as a validated, **non-executable** manifest
(`src/features/content-pg/manifests/fulfill.content.ts`) — importer input, not SQL. The POC imports it
transactionally into PGlite and proves 14 blocks resolve per VI/EN/ZH with the public DTO intact.
**PR #70 is closed as superseded; its SQL is never run against production.**

## Costs / new operational dependencies

Supabase project + backups/PITR; Hyperdrive config; a Postgres migration runner + CI Postgres service;
role/secret management (migration-owner vs runtime vs importer vs reader); connection-budget awareness at
the edge. These are net-new vs the all-D1 setup and are the price of DB-enforced relational integrity.
