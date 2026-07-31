# PostgreSQL content data plane (POC)

Canonical content store for service blocks, isolated in a **private `content` schema** (never Supabase's
exposed `public`). The editorial tables are reached **only through the CMS Worker** — never PostgREST /
the Supabase Data API. This directory is a hardened POC: it is **not deployed**, no production Supabase
resources exist yet, and nothing here writes remote data.

```
db/pg/
  migrations/   transactional schema DDL (schema, tables, constraints, triggers) — run by the migration owner
  bootstrap/    cluster-level role + privilege provisioning (NOT a migration) — run once, rerunnable
```

## Connection boundary (§5) — three distinct connections, never shared

| Concern | Connection | Role | Notes |
|---|---|---|---|
| **Runtime** (Worker reads/writes) | Cloudflare **Hyperdrive** binding → direct PG endpoint | `thg_cms_runtime` | `postgres.js` with `max:1` (Hyperdrive owns pooling — we do **not** stack a second pooler), prepared statements on, bounded timeouts. |
| **Schema migrations** | **Direct privileged** connection (not Hyperdrive) | migration owner (separate privileged role, **not** the runtime login, **not** `postgres`) | DDL is transactional; applied by whoever runs `migrations/`. |
| **Role bootstrap** | **Direct privileged** connection (not Hyperdrive) | a role that can `CREATE ROLE` | Roles are cluster objects, not per-schema DDL — see below. |

**Migration execution does not depend on Hyperdrive** — no advisory locks over the pooled binding, no
reliance on Hyperdrive session state. Migrations and bootstrap use a plain direct connection so that
pooling/session multiplexing can never interfere with DDL or `CREATE ROLE`. The full migration runner is
intentionally **not** built here (YAGNI until CI needs it); applying a `.sql` file over a direct
connection is the whole contract.

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
  - **`publish_revision(...)`** — the *only* publication path; re-checks ownership, rejects any
    revision whose `review_status <> 'reviewed'`, applies optional optimistic concurrency, and moves
    the single pointer atomically.
  The `content` FK `(localization_id, reviewed_from_revision_id) → revisions (localization_id, id)`
  makes cross-localization review lineage impossible; `CHECK ((review_status='reviewed') =
  (reviewed_from_revision_id IS NOT NULL))` ties lineage to status. The self-check proves: create-draft
  always drafts, the caller can't choose status, approve copies exact content + records lineage/reviewer,
  double-approve and stale/failed/missing approvals are rejected, cross-localization lineage is rejected,
  an approved revision publishes, and (via `SET ROLE`) the runtime cannot INSERT an arbitrary reviewed
  revision directly.
- **Publication ownership + eligibility** — the composite FK `(localization_id, revision_id) →
  revisions (localization_id, id)` makes a cross-localization pointer impossible. The self-check proves
  draft/stale/failed and cross-localization publishes are rejected, the live pointer is unchanged after
  a rejected attempt, an approved move is atomic, and a stale optimistic token is a conflict.
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

`bun run smoke:pg-runtime` is a **bounded, non-production** gate. It **no-ops (exit 0)** unless
`SMOKE_DATABASE_URL` is set, and **refuses** a host that looks like production. Pointed at a **disposable
Supabase preview branch**, it exercises what PGlite cannot: the real `postgres.js` driver + TLS + a real
PG server + prepared statements + typed error mapping, over one real connection and one transaction, with
**no connection string ever logged**.

It still does **not** prove the **Hyperdrive** hop (pooling/session behavior) — that is a deploy-time
smoke against a real Hyperdrive binding in a deployed Worker, and remains the gate before any production
cutover. Do not claim the real path is verified until the smoke has actually run against a preview branch.

```
SMOKE_DATABASE_URL="postgres://…preview-branch…" bun run smoke:pg-runtime
```

### Required Phase-2 gate (documented; not runnable until a preview project exists)

The optional command above is for local use. The **required** CI gate for the next phase — **blocking**,
not skip-on-absent — must:

1. **Fail (not skip)** when the preview database / Hyperdrive configuration is absent.
2. Run only against a **Supabase preview/dev** environment (never production; the prod-host guard stays).
3. Reach PostgreSQL through an **actual non-production Hyperdrive binding** in the **Worker runtime**
   (Miniflare/`wrangler dev` with a preview Hyperdrive), not a direct `postgres://` from Node.
4. Exercise **one prepared read**, **one transaction**, and a **publication rejection *and* approval**
   through `content.publish_revision` (reviewed passes; draft rejected).
5. Prove **error mapping** (a driver/constraint error surfaces as a typed `ContentError`).
6. **Log no secret** (assert the connection string never appears in output).

This stays **documented CI work for Phase 2** until a preview Supabase project + preview Hyperdrive
binding exist. The current `smoke:pg-runtime` is the local precursor; it deliberately connects directly
(no Hyperdrive) and therefore does **not** satisfy requirement 3. **The Hyperdrive path is not verified
until this gate runs.** No production binding is added now.
