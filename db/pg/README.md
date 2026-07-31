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

- **Publication ownership (§3)** — a composite FK `(localization_id, revision_id) →
  service_content_revisions (localization_id, id)` makes a cross-localization published pointer
  impossible at the DB level. The self-check proves PostgreSQL rejects "localization A → revision of B".
- **Revision immutability (§4)** — enforced two ways: (a) the runtime role has **`INSERT` only** on
  `service_content_revisions` (no `UPDATE`/`DELETE`), and (b) a `BEFORE UPDATE OR DELETE` trigger raises.
  The self-check proves both `UPDATE` and `DELETE` are rejected.

## What PGlite proves — and what it does not

The POC (`bun run check:pg-content-poc`) runs against **real PostgreSQL in-process** (PGlite / WASM), so
it genuinely validates the **schema, constraints, triggers, transactions, kind registry, DTO compat, and
manifest import**. PGlite has **no cluster roles**, so it does **not** validate the Supabase role
provisioning in `bootstrap/` or the privilege grants — those are reviewed as SQL and will first be
exercised by the runtime smoke below.

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
