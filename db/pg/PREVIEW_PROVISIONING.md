# PostgreSQL preview provisioning — owner checklist

The migration runner, the runtime gate and the importer are all implemented and locally proven.
What is **not** done is provisioning: no Supabase project, no Hyperdrive binding and no GitHub
environment exists yet. Everything in this file needs cloud credentials the repository does not
and must not hold, so it is an **owner action list**, not automation.

Until these steps are complete:

- `bun run db:pg:plan` works (offline, no credentials).
- `bun run db:pg:status` / `db:pg:up` **refuse** (exit 2).
- `bun run gate:pg-concurrency` **fails** (exit 1) — deliberately, not skips. A concurrency
  guarantee that reports green when unproven is worse than one that fails.
- `bun run smoke:pg-runtime` **skips** (exit 0) — it is the older opt-in local precursor and
  keeps its existing behavior.

Nothing here touches production. Every step targets a **disposable preview/dev** environment.

---

## Current state (verified in this repository)

| Item | State |
| --- | --- |
| `db/pg/migrations/0001..0005` | Present on `main`, dormant, never applied to a real server |
| `db/pg/bootstrap/0001_roles_and_privileges.sql` | Present, idempotent, never applied |
| Migration runner + CLI | **This PR** — proven against PGlite |
| Supabase preview project | **Absent** |
| Preview PostgreSQL connection | **Absent** |
| Migration-owner role credentials | **Absent** |
| Runtime role credentials | **Absent** |
| Importer role credentials | **Absent** |
| Non-production Hyperdrive binding | **Absent** — `wrangler.jsonc` declares none |
| GitHub environment + secrets | **Absent** |
| Preview Worker environment | **Absent** |

---

## 1. Create the Supabase preview project

Use a **separate project** (or a branch, if your plan has branching), never a schema inside
production. Record the project ref; the database host is `db.<ref>.supabase.co`.

Do not use the Supabase SQL editor for the migrations — it connects as a superuser, which would
make the migration owner own nothing and silently defeat the SECURITY DEFINER ownership model
that `bootstrap/0001` sets up.

## 2. Create the three roles

`bootstrap/0001_roles_and_privileges.sql` creates `thg_cms_runtime`, `thg_content_importer`,
`thg_content_reader` and `thg_content_fn_owner` **without passwords** — deliberately, so no
credential is ever committed. You additionally need a **migration owner**, which the bootstrap
does not create because it is the role that runs the bootstrap.

As a Supabase superuser, once:

```sql
-- Migration owner: privileged but NOT superuser, NOT the runtime login, NOT `postgres`.
CREATE ROLE thg_content_owner LOGIN NOSUPERUSER NOCREATEDB NOBYPASSRLS CREATEROLE
  PASSWORD '<generated — store in the secret manager, never here>';
GRANT CREATE ON DATABASE postgres TO thg_content_owner;
```

`CREATEROLE` is required only so the owner can run `bootstrap/0001` (which creates the four
roles and reassigns function ownership). Drop it afterwards if your policy prefers.

Then set the passwords the bootstrap intentionally omits:

```sql
ALTER ROLE thg_cms_runtime      WITH PASSWORD '<generated>';
ALTER ROLE thg_content_importer WITH PASSWORD '<generated>';
```

`thg_content_reader` and `thg_content_fn_owner` are `NOLOGIN` and need no password.

## 3. Apply the schema

From a machine that can reach the preview database — **not** from CI on the first run, so a
human sees the output:

```bash
export MIGRATE_PREVIEW_HOSTS="db.<ref>.supabase.co"
export MIGRATE_DATABASE_URL="postgres://thg_content_owner:<pw>@db.<ref>.supabase.co:5432/postgres"

bun run db:pg:plan       # offline: ordering + checksums, no connection
bun run db:pg:status     # what is applied vs pending
bun run db:pg:up         # apply 0001..0005 under the advisory lock
bun run db:pg:bootstrap  # roles + privileges, as the SAME owner, AFTER the migrations
```

Order matters: the owner must apply the migrations **first** so it owns the functions, then the
bootstrap reassigns them to `thg_content_fn_owner`.

## 4. Run the required concurrency gate

```bash
bun run gate:pg-concurrency
```

This opens **two real backend sessions** and proves the advisory lock serializes them. It is the
one guarantee PGlite cannot establish. It must pass before importer work proceeds.

## 5. Create the non-production Hyperdrive binding

```bash
wrangler hyperdrive create thg-content-preview \
  --connection-string "postgres://thg_cms_runtime:<pw>@db.<ref>.supabase.co:5432/postgres"
```

Add it to `wrangler.jsonc` under a **preview environment only** — never the top-level bindings,
which deploy to production:

```jsonc
"env": {
  "preview": {
    "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id from the command above>" }]
  }
}
```

The connection string given to Hyperdrive uses the **runtime** role, never the migration owner.
Migrations never traverse Hyperdrive (see `src/features/content-pg/migrate/runner.ts`).

## 6. GitHub environment and secrets

Create a `preview` environment (required reviewers optional) with:

| Secret | Value |
| --- | --- |
| `MIGRATE_DATABASE_URL` | migration-owner connection string |
| `MIGRATE_PREVIEW_HOSTS` | `db.<ref>.supabase.co` |
| `SMOKE_DATABASE_URL` | runtime-role connection string |
| `SMOKE_PREVIEW_HOSTS` | `db.<ref>.supabase.co` |

Scope them to the `preview` environment, not repository-wide, so a workflow must opt in by name.

## 7. Wire the blocking CI gate

Add to `.github/workflows/pr-ci.yml` — as a job that runs only where the environment is
available (a fork PR has no secrets, and must not report a false green):

```yaml
  pg-preview-gate:
    runs-on: ubuntu-latest
    environment: preview
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.13 }
      - run: bun install --frozen-lockfile
      - name: Migration concurrency gate (real PostgreSQL, two sessions)
        env:
          MIGRATE_DATABASE_URL: ${{ secrets.MIGRATE_DATABASE_URL }}
          MIGRATE_PREVIEW_HOSTS: ${{ secrets.MIGRATE_PREVIEW_HOSTS }}
        run: bun run gate:pg-concurrency
```

## 8. What is still NOT proven after all of the above

The Hyperdrive **hop** itself. Steps 1–7 prove the schema, the roles, the lock and a direct
runtime connection. They do not prove pooling/session behavior through an actual Hyperdrive
binding in a deployed Worker — that needs a `wrangler dev`/Miniflare run with the preview
binding, exercising a prepared read, a transaction, a publication approval and a publication
rejection, and asserting no connection string reaches the logs.

Until that runs, **do not state that the runtime path is verified**, and do not schedule a
production cutover.
