# CMS Foundation Conventions

> cmsthgfulfill is the **backend and source of truth** for the public landing
> (THG_landingpage). It owns the database, all business policy, moderation
> state, privacy boundaries, and the OpenAPI read contract. The landing repo
> is a client that renders what this repo decides.
>
> Community-specific architecture (the reference implementation of these
> conventions) lives in [docs/community/](../community/ARCHITECTURE.md).

## Feature folder convention

All domain code lives in `src/features/<feature>/`. A feature owns its:

- `*.service.ts` — domain use-cases and **explicit policy** (one per domain;
  never merge two domains into a generic service)
- `*.repo.ts` — boring D1 mechanics, parameterized where shared
- `*.mappers.ts` — public wire-shape whitelist projections (privacy boundary)
- `*.policy.ts` — visibility/indexability/invariant rules (single home)
- `*.schemas.ts` — canonical Zod response schemas referenced by OpenAPI
- `*.actions.ts` — admin server functions (editor-session gated)
- `*.http.ts` — shared HTTP handler mechanics if routes repeat

The dividing rule: **shared files hold mechanics, domain files hold policy.**
If a shared helper grows an `if (isX)` business branch, the abstraction is
wrong — split it back into the domain files.

## Route convention

- Public API: `src/routes/api/v1/(public)/<feature>/…` — thin files that wire
  schema + rate-limit key + service function + mapper + response key. No
  business logic in route files.
- Admin pages: `src/routes/admin/…` — use shared admin components
  (`src/components/cms/`, e.g. `moderation.tsx`) for chrome; keep
  domain-specific editors explicit per page.
- Route paths are stable; changing one is a breaking contract event.

## Admin / control-plane convention

The admin CMS is the only path from user-submitted content to public
visibility (moderation-first). Server functions in `*.actions.ts` validate
with Zod and require an editor session. Shared admin UI chrome lives in
`src/components/cms/`; do not build a generic admin CRUD builder.

## OpenAPI convention

- **GET endpoints are the contract**: registered in `src/openapi/paths.ts`
  against the feature's canonical Zod schemas (identity — not copies).
- **POST endpoints stay hand-written** and out of the spec (submit/withdraw
  precedent from leads/applicants/community).
- `bun run check:openapi-drift` asserts route-config schemas === canonical
  schemas. It must pass before every push.
- `paths.ts` is registered via `sideEffects` in package.json — do **not**
  split registration side effects into other files without verifying the
  build still includes them (a silent tree-shake here empties the spec).
  A future split of `paths.ts` (753 lines) is deferred until someone proves
  the bundler keeps the side effects; extract value-only config objects if
  it ever splits, never the `registry.registerPath` calls.

## Migration convention

- Migrations are append-only numbered SQL in `migrations/` (next free number,
  no renumbering).
- Default is **no migration**; new columns/tables need a feature-level reason.
- D1 runs with FKs off in practice — do not rely on cascading deletes.

## Public/private mapper convention

Public responses are built only by whitelist mappers (`*.mappers.ts`).
Never `SELECT *` passthrough. Fields that never leave the CMS: emails, `ip`,
`user_agent`, `utm_json`, token hashes, soft-delete timestamps, private
evidence/notes, internal moderation fields. Each mapper pair gets absence
tests. `verified`/`indexable` and similar flags are **server-computed** in
`*.policy.ts` and shipped in the payload — the landing never derives them.

## Generated files rule

`src/routeTree.gen.ts` is generated — never hand-edit. Anything ending in
`.gen.ts` follows the same rule.

## Where future modules go

New module (e.g. AI-assisted moderation, shipping database):

1. `src/features/<module>/` with the file layout above; policy explicit.
2. Own migration(s), own log tables — never piggyback on another feature's.
3. Public GETs registered in OpenAPI; POSTs hand-written.
4. Admin queue reuses `src/components/cms/` chrome.
5. AI components may propose; **"Verified by THG" stays operator-stamped**
   (see community FLOW_DIAGRAMS §F for the agreed AI boundary rules).
