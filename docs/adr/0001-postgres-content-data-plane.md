# ADR-0001 — PostgreSQL (Supabase) as the canonical Service Content data plane

**Status:** Proposed (POC delivered). **Date:** 2026-07-31.

## Context
Service content (per-page localized blocks: journey_step, capability, section_copy, pain_point,
process_step, solution, shipping_lane, policy, stat, resource) lives in Cloudflare **D1** as
`service_blocks` (VI + payload-encoded identity) + `service_block_translations` (EN/ZH). That model has
structural debt: business identity hidden in `payload_json.key`, **no DB-enforced uniqueness**, VI as a
special core-table row while EN/ZH are translations, `kind` free-form/untyped, and content seeds forced
to re-implement identity/locale/governance in generated SQL (PR #70). The owner has redirected the
target: **CMS stays the control plane; a relational store becomes the canonical content data plane.**

## Decision
Adopt **Supabase PostgreSQL** as the canonical Service Content data plane, reached from the Cloudflare
Worker via **Hyperdrive** using a **least-privilege runtime role**. Planes:

- **Control plane** — CMS Admin UI, Worker API, auth, RBAC, typed validation (kind registry),
  draft/review/publish workflow, audit, `bumpCmsRev` cache revalidation. *Unchanged home.*
- **Canonical data plane** — PostgreSQL: `content_locales`, `service_content_pages`,
  `service_content_blocks` (locale-neutral core), `service_content_localizations`,
  `service_content_revisions` (immutable), `service_content_publications` (published pointer).
- **Delivery plane** — the current public `/service-blocks` API, returning flat locale-resolved DTOs.
  Landings keep their contract; they never see the DB model.
- **Optional edge read plane** — a Cloudflare cache/KV/D1 *projection* only if justified; **never** a
  second writable source of truth.

**The browser never receives DB credentials.** CMS Admin UI → authenticated Worker endpoint → service
→ repository → Postgres. RLS + DB privileges are defense-in-depth, not a replacement for Worker RBAC.

## Why PostgreSQL, not MongoDB (for this domain)
This is a **relational editorial graph**, not a document store. Postgres fits it directly:
- **Composite uniqueness** `UNIQUE(page_id, kind, block_key)` — DB-enforced business identity (the exact
  guarantee D1 lacks and PR #70 had to fake with runtime preflight).
- **Foreign keys** page→block→localization→revision→publication with cascade integrity.
- **Immutable revisions + an explicit publication pointer** — “reviewed ≠ published”, draft edits can’t
  mutate live content; a single-row pointer move is the atomic publish.
- **Transactional imports** — one manifest = one transaction; partial state impossible.
- **Reporting/search readiness** — flat columns to project into FTS/RAG documents.
- **JSONB** still gives typed flexible payloads (`core_config`, `translated_payload`) with `CHECK`s.

MongoDB is **not unsafe** — it is a **poorer fit** here: cross-document referential integrity, composite
uniqueness across a relational graph, and immutable-revision + published-pointer semantics are native in
Postgres and manual/weaker in a document model. We keep JSONB for the flexible parts, so we lose nothing.

## Consequences
- One writable source of truth after cutover (D1 content tables retired last, behind a rollback window).
- DB-enforced identity removes seed-time preflight; the content importer relies on constraints, not
  operational duplicate guards.
- Uniform locale model (VI is a normal locale); typed kinds; new locales via `INSERT` not `ALTER`.
- New operational dependencies: a Supabase project, Hyperdrive binding, a Postgres migration runner, and
  role/secret management — see `docs/content-data-plane-migration.md`.
- Additive, staged, reversible migration (schema → import → sync/freeze → shadow → read cutover → write
  cutover → deprecate). No big-bang.

## Alternatives rejected
- **Keep D1 + patch Sonar (PR #70):** debt persists (no DB identity, VI special-case, untyped kinds).
- **D1 Service Content V2:** better than today but still no composite-unique/immutable-revision ergonomics
  and a second SQLite dialect to hand-roll; superseded by this decision.
- **MongoDB:** poorer fit for the relational editorial workflow (above).
- **Direct Supabase Data API to the browser:** violates the security boundary; rejected.
