# Service Content → PostgreSQL: connection, migration & cutover plan

Companion to `docs/adr/0001-postgres-content-data-plane.md`. Nothing here has been applied to
production; the POC runs only against local PGlite.

## Connection architecture (Worker → Hyperdrive → Supabase)
```
CMS Admin UI ──auth──▶ Worker API ──▶ content service ──▶ repository ──▶ PgExec
                                                                          │
                                          Cloudflare Hyperdrive (pooled) ─┘──▶ Supabase Postgres
                                                                                (role: thg_cms_runtime)
```
- Driver: **postgres.js** (`postgres`), Workers-compatible (`nodejs_compat` is already enabled).
- Adapter: `src/features/content-pg/pg-adapter.ts` — a narrow `PgExec` port. `createRuntimeExec(env)` is
  lazy/per-request, `max:1` (**Hyperdrive owns pooling — do not stack a second pooler**), `prepare:true`
  (Hyperdrive-compatible), bounded `connect_timeout`/`idle_timeout`, `healthCheck()` reveals no secrets,
  failures map to `ContentError('db_unavailable')`. No connection string is ever logged.
- **Wrangler binding (NOT added to production in this POC):**
  ```jsonc
  // wrangler.jsonc — add when the Supabase project + Hyperdrive config exist
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<hyperdrive-config-id>" }]
  ```
  Local/dev uses `DATABASE_URL` (never a production secret). Roles: `db/pg/migrations/0002_least_privilege_roles.sql`.

## Postgres migration runner (to add in the implementation PR)
D1’s `wrangler d1 migrations` does not apply to Postgres. Add a tiny runner (`scripts/pg-migrate.ts`,
`postgres.js`) that applies `db/pg/migrations/*.sql` in order inside a transaction and records applied
files in a `schema_migrations` table. CI runs it against an ephemeral Postgres service; the POC applies
the schema in-process (PGlite) as proof.

## Staged migration (additive, reversible — one writable source of truth after cutover)
| Phase | Action | Migrations / modules | Invariant | Rollback | Gate |
|---|---|---|---|---|---|
| 1 | PG schema, no runtime change | `0001_service_content.sql`, `0002_least_privilege_roles.sql`, kind registry | additive; no read/write path touches PG | drop new schema | migrations apply; POC green |
| 2 | Importer + curated manifests (Order **block_key** scheme decided), dry-run + collision report | `content.importer.ts`, `manifests/*` | import is one tx; DB rejects dup identity | none (no prod read) | dry-run diff reviewed |
| 3 | V1 D1 → PG sync **or** owner-approved short write-freeze (pick by measured write volume) | one-off sync job | no lost writes | replay from D1 | parity counts |
| 4 | Shadow-read parity (fixtures/controlled data only — **no prod shadow traffic**) | shadow harness (POC already compares V1 vs PG DTO) | DTO/order identical | n/a | zero diffs |
| 5 | Public read cutover behind a flag | route reads PG via compat mapper | contract byte-stable | flip flag → D1 | canary parity |
| 6 | Admin writes + publishing cutover | admin service_fns → PG | reviewed≠published preserved | flip flag → D1 (dual-write only if evidence requires) | write parity |
| 7 | Disable V1 writes; rollback window; later drop D1 content tables | cleanup | single source of truth | restore from backup within window | stability window elapsed |

## Fulfill content preservation & PR #70
The 14 low-risk Fulfill roles are preserved as a validated, **non-executable** manifest
(`src/features/content-pg/manifests/fulfill.content.ts`) — importer input, not SQL. The POC imports it
transactionally into PGlite and proves 14 blocks resolve per VI/EN/ZH with the public DTO intact.
**PR #70 is closed as superseded; its SQL is never run against production.**

## Costs / new operational dependencies
Supabase project + backups/PITR; Hyperdrive config; a Postgres migration runner + CI Postgres service;
role/secret management (migration-owner vs runtime vs importer vs reader); connection-budget awareness at
the edge. These are net-new vs the all-D1 setup and are the price of DB-enforced relational integrity.
