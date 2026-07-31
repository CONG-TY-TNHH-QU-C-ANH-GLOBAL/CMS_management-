# PostgreSQL content data plane (POC)

Canonical content store for service blocks, isolated in a **private `content` schema** (never Supabase's
exposed `public`). The editorial tables are reached **only through the CMS Worker** — never PostgREST /
the Supabase Data API. This directory is a hardened POC: it is **not deployed**, no production Supabase
resources exist yet, and nothing here writes remote data.

```text
db/pg/
  migrations/                           ORDERED, one concern per file — applied in filename order:
    0001_service_content_schema.sql       schema, enum domains, tables, indexes, constraints
    0002_create_draft_revision.sql        content.create_draft_revision (draft-only)
    0003_approve_revision.sql             content.approve_revision (exact-draft → reviewed + lineage)
    0004_publish_revision.sql             content.publish_revision (compare-and-swap pointer move)
    0005_invariants_triggers.sql          revision-immutability + block-version triggers
  bootstrap/                            cluster-level role + privilege provisioning (NOT a migration):
    0001_roles_and_privileges.sql         run ONCE by the migration owner, after the migrations
```

**Operator & order:** apply `migrations/0001..0005` **as the migration owner** (a privileged,
NON-superuser role that owns the `content` schema — not the runtime login, not `postgres`), then apply
`bootstrap/0001` as the same owner. The self-check applies the whole ordered set the same way.

**Runtime client lifecycle (Cloudflare):** the postgres.js client is created **inside the Worker
request handler** via `createRequestPgScope(env)` and passed through services/repositories, then closed
in `finally`. There is **no module/isolate-level client cache** — a Cloudflare I/O object must not be
reused across requests. Within one request scope, concurrent `getExec()` calls share one connection
attempt (the in-flight promise is stored before awaiting); a failed attempt clears the state; `close()`
waits for any in-flight connection and is idempotent. **Hyperdrive owns cross-request pooling.**

## Connection boundary (§5) — three distinct connections, never shared

| Concern                           | Connection                                             | Role                                                                                      | Notes                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime** (Worker reads/writes) | Cloudflare **Hyperdrive** binding → direct PG endpoint | `thg_cms_runtime`                                                                         | `postgres.js` with `max:1` (Hyperdrive owns pooling — we do **not** stack a second pooler), prepared statements on, bounded timeouts. |
| **Schema migrations**             | **Direct privileged** connection (not Hyperdrive)      | migration owner (separate privileged role, **not** the runtime login, **not** `postgres`) | DDL is transactional; applied by whoever runs `migrations/`.                                                                          |
| **Role bootstrap**                | **Direct privileged** connection (not Hyperdrive)      | a role that can `CREATE ROLE`                                                             | Roles are cluster objects, not per-schema DDL — see below.                                                                            |

**Migration execution does not depend on Hyperdrive** — no advisory locks over the pooled binding, no
reliance on Hyperdrive session state. Migrations and bootstrap use a plain direct connection so that
pooling/session multiplexing can never interfere with DDL or `CREATE ROLE`.

### Migration runner

This README previously said the runner was YAGNI "until CI needs it". A preview environment plus an
importer is that point — applying a `.sql` file by hand stops being a contract the moment two people
or two CI jobs can do it at once. The runner now lives in
`src/features/content-pg/migrate/` and is driven by `scripts/pg-migrate.ts`:

| Command | What it does | Needs credentials |
| --- | --- | --- |
| `bun run db:pg:plan` | Ordering + checksums from disk. Never connects. | no |
| `bun run db:pg:status` | Applied vs pending, from `public.schema_migrations`. | yes |
| `bun run db:pg:up` | Apply pending migrations under the advisory lock. | yes |
| `bun run db:pg:bootstrap` | Apply `bootstrap/*.sql` — **not** recorded as history. | yes |
| `bun run gate:pg-concurrency` | Two real sessions prove the lock serializes runners. | yes |

Guarantees: `schema_migrations` history with SHA-256 checksums (an edited applied migration is
rejected before anything new runs, and a deleted one is rejected too), ordered discovery, a session
advisory lock taken **before** the history is read and released in a `finally`, bounded
statement/lock timeouts, one reserved session (`max: 1`), transactional by default with a
per-migration `-- migrate:no-transaction` opt-out declared in the file itself (and therefore
covered by its checksum), idempotent rerun, and failure that stops at the first bad migration
leaving no history row for it.

Bootstrap is deliberately **not** a migration: roles are cluster objects and `bootstrap/0001` is
re-runnable by design, so recording a checksum over it would claim an immutability it does not have.

`gate:pg-concurrency` **fails** rather than skips when unconfigured — see
[PREVIEW_PROVISIONING.md](./PREVIEW_PROVISIONING.md) for the owner steps that make it runnable.

## Role bootstrap lifecycle (§2)

`bootstrap/0001_roles_and_privileges.sql` is **separate from migrations on purpose**: roles are
cluster-level, so they are not a transactional, per-database schema migration.

- **Rerunnable / idempotent** — guarded `CREATE ROLE` in a `DO` block.
- **No committed password** — credentials are injected out-of-band (`ALTER ROLE … WITH PASSWORD` / a
  connection secret) and rotated separately.
- **Least privilege** — every role is `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`; the bootstrap
  never grants membership in `postgres`.
- **Operator** — run once by the migration owner (a privileged role that is neither the runtime login
  nor `postgres`).

## Privilege hardening (§1) — not RLS alone

`REVOKE ALL … FROM PUBLIC` on the schema, all tables, and all sequences; **no grants to Supabase's
`anon` / `authenticated` / `service_role`** (the tables are not exposed via the Data API). The runtime
role gets scoped `USAGE` + table/sequence privileges and a **pinned `search_path = content`**. RLS is
defense-in-depth on top of these privileges, added once runtime claims are finalized — the privileges
are the primary boundary.

## DB-enforced invariants (proven by the POC)

- **Business identity is immutable by privilege** — the runtime role's `UPDATE` is granted
  **column-by-column**, excluding the stable slug (pages), `page_id`/`kind`/`block_key` (blocks), and
  `block_id`/`locale` (localizations). The self-check flips to `thg_cms_runtime` via `SET ROLE` and
  proves each identity `UPDATE` is `permission denied` while mutable structure columns succeed.
- **Revision workflow with DB-enforced provenance** — the runtime has **no direct write** on
  `service_content_revisions` at all; three SECURITY DEFINER functions are its only path:
  - **`create_draft_revision(...)`** — `review_status` is **forced to `'draft'`** (the caller cannot
    choose a status), so the runtime can never fabricate a `reviewed` row.
  - **`approve_revision(draft_id, reviewer_id, expected_version)`** — copies the **exact** draft
    content (the caller supplies no title/description/payload), appends a new `reviewed` revision with
    **`reviewed_from_revision_id`** = the draft, and records `reviewed_by`/`reviewed_at`. A `reviewed`
    revision therefore provably corresponds to a specific submitted draft. Only a `draft` is
    reviewable; `uq_reviewed_from` forbids approving one draft twice.
  - **`publish_revision(...)`** — the _only_ publication path; re-checks ownership, rejects any
    revision whose `review_status <> 'reviewed'`, applies optional optimistic concurrency, and moves
    the single pointer atomically.
    The `content` FK `(localization_id, reviewed_from_revision_id) → revisions (localization_id, id)`
    makes cross-localization review lineage impossible; `CHECK ((review_status='reviewed') =
(reviewed_from_revision_id IS NOT NULL))` ties lineage to status. The self-check proves: create-draft
    always drafts, the caller can't choose status, approve copies exact content + records lineage/reviewer,
    double-approve (PT409 conflict), already-reviewed and missing approvals are rejected, cross-localization lineage is rejected,
    an approved revision publishes, and (via `SET ROLE`) the runtime cannot INSERT an arbitrary reviewed
    revision directly.
- **Publication ownership + eligibility + concurrency** — the composite FK `(localization_id,
revision_id) → revisions (localization_id, id)` makes a cross-localization pointer impossible.
  `publish_revision` is a **compare-and-swap**: it locks the **stable localization row** `FOR UPDATE`
  (which exists before any publication — a publication-row lock cannot serialize the _first_ publish),
  reads the current pointer, and rejects (conflict) when it `IS DISTINCT FROM` the caller's
  `expected_revision_id` (`NULL` = "expect none yet"). The self-check proves draft and
  cross-localization publishes are rejected, the live pointer is unchanged after a rejected attempt, and
  the compare-and-swap outcomes (two first-publishes can't both win; two republishes with the same
  expected pointer can't both win; the loser gets conflict; the pointer ends on exactly one revision).
  _PGlite is single-connection, so true wall-clock concurrency is proven only under the Phase-2 gate._
- **Block version is DB-owned, not caller-assignable** — a `BEFORE UPDATE` trigger bumps
  `service_content_blocks.version` by exactly one when a mutable structure column
  (position/icon/core_config/is_active) actually changes, ignores no-ops, and overwrites any
  caller-supplied value; the runtime also lacks the `UPDATE (version)` column privilege. This is the
  optimistic token `approve_revision(expected_version)` checks. Proven both ways.
- **Revision immutability** — two layers: the runtime has **no** `UPDATE`/`DELETE` on
  `service_content_revisions` (and no direct `INSERT`), and a `BEFORE UPDATE OR DELETE` trigger raises.
  Both are proven. The dedicated `thg_content_fn_owner` role that owns the functions is itself strictly
  **INSERT-only** on revisions (no row lock is taken in `approve_revision` — the immutable source plus
  `uq_reviewed_from` give the concurrency guarantee without needing UPDATE privilege).
- **Deletion / history semantics** — historical boundaries use **`ON DELETE RESTRICT`**
  (block→page, localization→block, revision→localization), so a hard delete of a page/block with
  content is rejected **predictably as a FK violation** (not as a side effect of the immutability
  trigger firing mid-cascade). Lifecycle: pages are **archived** (`status='archived'`), blocks are
  **disabled** (`is_active=false`); revisions are never removed. The publication pointer is `CASCADE`
  because it is an ephemeral pointer, not history. Empty scaffolding (a block with no localizations)
  is still deletable. No broad purge facility exists in this PR.

## What PGlite proves — and what it does not

The POC (`bun run check:pg-content-poc`) runs against **real PostgreSQL in-process** (PGlite / WASM). It
validates the **schema, constraints, triggers, transactions, the publish function, kind registry, DTO
compat, and manifest import** — and, because PGlite honors `CREATE ROLE`, column-level `GRANT`, and
`SET ROLE`, and SECURITY DEFINER ownership by a non-superuser function-owner, it also **genuinely
enforces the least-privilege grants** in `bootstrap/` (identity columns denied, function-only
draft/approve/publish, no direct revision write). What PGlite still does **not** prove:
real **authentication** (`LOGIN`/passwords), Supabase's own `anon`/`authenticated`/`service_role`
exposure, and the **Hyperdrive** path — those are the job of the required runtime gate below.

## Runtime smoke gate (§6) — next phase, not run here

`bun run smoke:pg-runtime` is a **bounded, non-production, FAIL-CLOSED** gate:

- no `SMOKE_DATABASE_URL` → **SKIP** (exit 0): the gate is opt-in;
- URL set but `SMOKE_PREVIEW_HOSTS` unset → **REFUSE** (exit 2): explicit preview authorization required;
- URL host not on the allowlist → **REFUSE** (exit 2) — it parses the URL and checks the **hostname only**,
  never logging the credential or full URL;
- authorized → **preflight** (health check + prepared parameterized query + host verification; any
  failure aborts _before_ any write), then the disposable write path (upsert page → block → localization
  → draft → approve → publish; verify reviewed differs-from/links-to the draft and the pointer equals it;
  reject publishing the draft with the exact `not_publishable` code; verify the pointer is unchanged;
  duplicate identity with the exact `duplicate_identity` code) runs inside **one transaction that always
  rolls back** via an intentional sentinel — **no fixture survives on success or failure** (immutable
  revision history is never destructively deleted). The refusal paths and the rollback+write-path logic
  are unit-tested (`scripts/pg-runtime-smoke.test.ts`, and the POC runs the exact write-path against
  PGlite for a deterministic rollback proof).

It still does **not** prove the **Hyperdrive** hop (pooling/session behavior) — that is a deploy-time
smoke against a real Hyperdrive binding in a deployed Worker, and remains the gate before any production
cutover. Do not claim the real path is verified until the smoke has actually run against a preview branch.

```bash
SMOKE_DATABASE_URL="postgres://…preview-branch…" \
  SMOKE_PREVIEW_HOSTS="db.abc123.supabase.co" \
  bun run smoke:pg-runtime
```

### Required Phase-2 gate (documented; not runnable until a preview project exists)

The optional command above is a **local** convenience (skip when unconfigured; fail-closed host checks
when a URL is given). The **required** CI gate for the next phase is a different thing — **blocking**
(not skip-on-absent) and it **must pass before any migration/importer work proceeds**. It must:

1. **Fail (not skip)** when the preview database / Hyperdrive configuration is absent.
2. Run only against a **Supabase preview/dev** environment (never production; the fail-closed preview-host allowlist stays).
3. Reach PostgreSQL through an **actual non-production Hyperdrive binding** in the **Worker runtime**
   (Miniflare/`wrangler dev` with a preview Hyperdrive), not a direct `postgres://` from Node.
4. Exercise **one prepared read**, **one transaction**, and a **publication rejection _and_ approval**
   through `content.publish_revision` (reviewed passes; draft rejected).
5. Prove **error mapping** (a driver/constraint error surfaces as a typed `ContentError`).
6. **Log no secret** (assert the connection string never appears in output).

Requirement 1 is now implemented for the migration half: `bun run gate:pg-concurrency` fails (exit 1)
when the preview database is absent, and proves two-session lock serialization when it is present.
Requirements 3–6 — the Worker/Hyperdrive hop itself — stay **documented CI work for Phase 2** until a
preview Supabase project + preview Hyperdrive binding exist. The current `smoke:pg-runtime` is the local precursor; it deliberately connects directly
(no Hyperdrive) and therefore does **not** satisfy requirement 3. **The Hyperdrive path is not verified
until this gate runs.** No production binding is added now.
