# THG Community — System Architecture

> Scope: Q&A (Sprint 1) + Verified Reviews (Sprint 4). This document is the
> source-of-truth map for how the community system is layered across the two
> repos, and the contract rules future features (Smart Moderation, AI
> Verification, Submission Status, Shipping Database) must respect.
>
> Companion docs: [FLOW_DIAGRAMS.md](./FLOW_DIAGRAMS.md), [REUSE_BOUNDARIES.md](./REUSE_BOUNDARIES.md).
> Landing-side view: `THG_landingpage/docs/community/ARCHITECTURE.md`.

## Purpose

The community system is a **THG seller trust engine**, not a generic forum.
Every design decision biases toward: moderated content only, verified answers,
privacy-safe public output, and SEO that only exposes content THG has stamped.

## System roles

| Role | Owner | What it does |
|---|---|---|
| **Source of truth** | CMS (`cmsthgfulfill`, Cloudflare Workers) | Owns all community data, validation, moderation state, policy. |
| **Persistence** | Cloudflare D1 | `community_categories`, `community_questions`, `community_reactions`, `community_reviews` (migrations 0035–0037). |
| **Contract** | OpenAPI (`src/openapi/paths.ts` + `src/features/community/community.schemas.ts`) | GET-only public read contract. Landing consumes generated types from `/api/v1/openapi`. |
| **Control plane** | Admin CMS (`/admin/content/community`, `/admin/content/community/reviews`) | Operators set status, verify, write expert answers / public summaries. Only path to public visibility. |
| **Public client** | Landing (`THG_landingpage`) | Renders published content, hosts submit dialogs, holds owner tokens in localStorage. Derives nothing. |
| **Read-only consumer** | SEO/prerender (landing `scripts/generate-sitemap.ts`, `scripts/prerender.mjs`) | Consumes only `indexable === true` URLs at build time. |

## Layering inside the CMS

All community code lives in `src/features/community/`:

| File | Layer | Rule |
|---|---|---|
| `community.repo.ts` | Shared D1 mechanics | Table-parameterized plumbing (slug retry, withdraw-by-owner, published/admin queries). No business policy. |
| `community.http.ts` | Shared HTTP mechanics | Rate-limit + JSON + Turnstile guards, list/detail/withdraw handlers. No business policy. |
| `community.owner.ts` | Shared security mechanic | Token generate/hash. Raw token is returned exactly once; only SHA-256 hash is stored. |
| `community.slug.ts` | Shared pure helpers | Vietnamese-safe slugify + collision picker. DB-free, fully tested. |
| `community.mappers.ts` | Privacy boundary | Whitelist projection DB row → public wire shape. The ONLY place public shapes are built. |
| `community.policy.ts` | Policy boundary | `isIndexable` / `isReviewIndexable` / expert-answer invariant. The ONLY place indexability is computed. |
| `community.schemas.ts` | Contract boundary | Canonical Zod response schemas, referenced by OpenAPI paths (identity-checked by `check:openapi-drift`). |
| `community.service.ts` | Q&A domain | Explicit Q&A policy: expert answer, verified stamp, same-issue reactions. |
| `community.reviews.service.ts` | Reviews domain | Explicit review policy: rating, public summary, private evidence. |
| `community.actions.ts` | Admin server functions | Editor-session-gated moderation actions for both domains. |
| `routes/api/v1/(public)/community/**` | Public HTTP surface | Thin routes: wire a handler to a service + mapper. |

**The rule that keeps this maintainable:** shared files hold *mechanics*
(how to insert with a unique slug, how to rate-limit, how to hash a token);
domain files hold *policy* (what makes a question verified, what makes a
review indexable). Never move policy into a shared mechanic, and never
copy a mechanic into a domain file.

## Owner-token browser ownership model

There are no user accounts. Ownership = possession of a one-time token.

- Submit → CMS mints a 256-bit random token, stores only its SHA-256 hash
  (`owner_token_hash`), returns the raw token once in the POST response.
- Landing stores it in localStorage (`thg_community_owner_v1`, review slugs
  namespaced as `review:{slug}`).
- Withdraw → landing sends the raw token; CMS re-hashes and compares.
  Match → soft-delete (`withdrawn_at = unixepoch()`). Mismatch → generic 404
  (no ownership enumeration).
- Lost token = lost withdraw ability. Accepted trade-off; moderators can
  still act via the admin CMS.

## Privacy boundary

Public responses are built **only** by the whitelist mappers in
`community.mappers.ts`. Fields that never leave the CMS:

- Both domains: `author_email`/`reviewer_email`, `ip`, `user_agent`,
  `utm_json`, `owner_token_hash`, `withdrawn_at`.
- Reviews additionally: `private_evidence_note`, `private_order_reference`.

Enforced by tests (`community.test.ts`, `community.reviews.test.ts`) that
assert the private keys are absent from mapper output. Any new public field
must be added to the mapper, the Zod schema, and the OpenAPI registration —
the drift check fails otherwise.

## Indexability boundary

`indexable` is **server-computed** in `community.policy.ts` and shipped in
every public payload:

- Q&A: `published AND verified AND expert_answer non-empty`.
- Reviews: `published AND verified AND not withdrawn AND title non-empty AND body ≥ 60 chars` (`MIN_INDEXABLE_REVIEW_BODY`).

Landing never derives it. Sitemap, prerender, `noindex`, and JSON-LD all key
off this one flag. Changing SEO policy = changing one file here.

## Contract rules

1. **Landing must not derive `verified`/`indexable` itself.** It renders the
   server-computed flags. If landing needs a new visibility rule, it becomes
   a new server-computed field.
2. **Public APIs never expose private fields.** New fields go through the
   whitelist mapper + canonical schema, never `SELECT *` passthrough.
3. **OpenAPI/generated types must be regenerated after CMS deploy.**
   Landing: `bun run generate:cms-types`, gated by `check:cms-types` in CI.
4. **GET endpoints are OpenAPI-registered; POST endpoints stay hand-written.**
   Repo convention (see `paths.ts` — submit/withdraw excluded, following the
   leads/applicants precedent). One-time token delivery does not belong in a
   generated SDK surface.
5. **Sitemap/prerender include only `indexable` detail URLs.** List pages are
   always included; detail URLs are gated.
6. **`noindex` for pending / unverified / withdrawn / non-indexable pages.**
   Landing defaults to `noindex` while loading or on 404 (safe default).
7. **Moderation-first.** Every submission lands as `status='pending'`.
   Nothing is publicly visible without an operator action. Future AI
   moderation may *propose* transitions but the policy engine + human review
   remain the gate for anything user-visible (see FLOW_DIAGRAMS.md §F).

## Where future features plug in

| Future feature | Plugs into | Must NOT touch |
|---|---|---|
| Smart Moderation / AI Verification | New pipeline between submit guard and `status` transitions; writes evidence to its own tables/log | Mappers' whitelists, indexability policy semantics, owner-token flow |
| Submission Status (public) | New GET endpoint + server-computed status projection via a new mapper | Existing public shapes |
| Shipping Database | New domain service beside Q&A/Reviews, reusing repo/http/owner mechanics | Q&A/Review domain services |
