# Owner handoff — PostgreSQL preview environment

One page. Everything below is **non-production** and needs cloud credentials this repository
does not and must not hold. `PREVIEW_PROVISIONING.md` is the long form; this is the checklist.

**Do not paste any connection string, password or project ref into a chat, an issue, a commit,
or a PR description.** Every value below belongs in your secret manager and in the GitHub
`preview` environment. Nobody needs to see them to help you — the commands print hostnames only.

---

## 1. Create (non-production only)

| # | Resource | Notes |
| --- | --- | --- |
| 1 | Supabase **preview/dev project** (or branch) | Separate project — never a schema inside production. Note the ref; the host is `db.<ref>.supabase.co`. |
| 2 | Role `thg_content_owner` | The **migration owner**. `LOGIN NOSUPERUSER NOCREATEDB NOBYPASSRLS CREATEROLE`, plus `GRANT CREATE ON DATABASE`. The bootstrap cannot create it — it is the role that *runs* the bootstrap. |
| 3 | Passwords for `thg_cms_runtime` and `thg_content_importer` | The bootstrap creates these roles **without** passwords on purpose, so none is ever committed. Set them with `ALTER ROLE … WITH PASSWORD`. |
| 4 | Hyperdrive config `thg-content-preview` | `wrangler hyperdrive create` using the **runtime** role's connection string, never the owner's. |
| 5 | GitHub environment `preview` | Holds the four secrets below, scoped to that environment — not repository-wide. |

Do **not** run the migrations from the Supabase SQL editor: it connects as a superuser, so the
migration owner would own nothing and the SECURITY DEFINER ownership model in `bootstrap/0001`
would be silently defeated.

## 2. Exact names the code expects

Change any of these and the commands stop finding their configuration.

| Name | Where | Value |
| --- | --- | --- |
| `MIGRATE_DATABASE_URL` | shell / GitHub env `preview` | Direct connection **as `thg_content_owner`**. Never Hyperdrive, never the runtime login, never `postgres`. |
| `MIGRATE_PREVIEW_HOSTS` | shell / GitHub env `preview` | `db.<ref>.supabase.co` — comma-separated exact hostnames. |
| `SMOKE_DATABASE_URL` | GitHub env `preview` | Connection as `thg_cms_runtime`. |
| `SMOKE_PREVIEW_HOSTS` | GitHub env `preview` | Same host list. |
| `HYPERDRIVE` | `wrangler.jsonc`, **`env.preview` only** | Binding name read by `createRequestPgScope`. Must not appear at the top level, which deploys to production. |

## 3. Validate, in this order

```bash
export MIGRATE_PREVIEW_HOSTS="db.<ref>.supabase.co"
export MIGRATE_DATABASE_URL="postgres://thg_content_owner:<pw>@db.<ref>.supabase.co:5432/postgres"

bun run db:pg:plan        # offline — no connection, no credentials needed
bun run db:pg:status      # what is applied vs pending
bun run db:pg:up          # apply 0001..0005 under the advisory lock
bun run db:pg:bootstrap   # roles + privileges, as the SAME owner, AFTER the migrations
bun run gate:pg-concurrency   # THE gate: two real sessions prove the lock serializes runners
```

Order matters: the owner must apply the migrations **first** so it owns the functions, then the
bootstrap reassigns them to `thg_content_fn_owner`.

### What success looks like

```
$ bun run db:pg:plan
Migration plan — 5 file(s) in db/pg/migrations
  0001_service_content_schema.sql  6fe5654c1805…  transactional
  … 0002..0005 …
Against an empty database: 5 would apply, in this order.

$ bun run db:pg:up
pg-migrate: connected to preview host db.<ref>.supabase.co
Applying 0001_service_content_schema.sql…
  ✓ 0001_service_content_schema.sql
  … through 0005 …
5 applied this run, 0 already present.

$ bun run gate:pg-concurrency
pg-migrate-concurrency — real PostgreSQL, host db.<ref>.supabase.co
  ✓ two distinct backends (…/…)
  ✓ a second session is refused the lock while the first holds it
  ✓ the lock is available again after the first runner releases it
  ✓ a failed run releases the lock rather than wedging the next one
  ✓ exactly 0 migration(s) applied across both runners (got 0) — no double-apply
  ✓ exactly one schema_migrations row per migration
  ✓ history covers every migration on disk (5/5)
  ✓ a rerun after the race applies nothing
OK — advisory lock serializes real concurrent runners.
```

A second `bun run db:pg:up` must print `0 applied this run, 5 already present.`

### Common bounded failures

| Output | Meaning | Fix |
| --- | --- | --- |
| `REFUSED — MIGRATE_DATABASE_URL is not set` (exit 2) | Nothing configured. These commands never skip. | Export the variable. |
| `REFUSED — MIGRATE_PREVIEW_HOSTS is not configured` (exit 2) | No allowlist. | Export the host list. |
| `REFUSED — host "…" is not on the preview allowlist` (exit 2) | The URL points somewhere the allowlist does not name — **this is the production guard**. | Check you are not pointed at production. |
| `FAILED — MIGRATE_DATABASE_URL is not set` (exit 1, concurrency gate) | The gate fails rather than skipping: unproven is not the same as satisfied. | Provision first. |
| `REFUSED — health check failed` (exit 2) | Reachable config, unreachable database. | Check the network/IP allowlist and that the project is awake. |
| `Migration "…" has changed since it was applied` | A historical migration was edited. | Restore the file and add a NEW migration. |
| `permission denied for schema content` | Connected as the wrong role. | Use `thg_content_owner`, not the runtime login. |

All four refusal paths were verified locally, including against a production-looking hostname
that is not on the allowlist. No output at any point contains the credential — only the
hostname.

## 4. Teardown

The preview environment is disposable; the safe reset is to destroy and recreate, not to
hand-edit schema.

```bash
# 1. Remove the Hyperdrive config first, so nothing can route to a database that is going away.
wrangler hyperdrive delete <id>

# 2. Delete the Supabase preview project (or reset the branch) in the dashboard.

# 3. Clear the GitHub environment secrets, then rotate the two role passwords if the project
#    is being kept rather than deleted.
```

Do **not** "clean up" by dropping tables in a database you intend to keep: `schema_migrations`
would still claim they were applied, and the next `db:pg:up` would be a no-op against an empty
schema. If you must keep the project, drop `schema.content` **and** `public.schema_migrations`
together, then re-run `db:pg:up`.

## 5. After this passes, what is still unproven

The **Hyperdrive hop itself**. Steps 1–3 prove the schema, the roles, the lock and a direct
runtime connection. They do not prove pooling or session behavior through an actual Hyperdrive
binding in a running Worker — that needs `wrangler dev`/Miniflare against the preview binding,
exercising a prepared read, a transaction, a publication approval and a publication rejection,
and asserting no connection string reaches the logs.

Until that runs, the runtime path is **not** verified and no production cutover is scheduled.
