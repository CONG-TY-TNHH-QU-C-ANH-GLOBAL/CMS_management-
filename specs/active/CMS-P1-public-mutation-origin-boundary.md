# CMS-P1 — Public Browser Mutation Origin Boundary

## 1. Status

**IMPLEMENTED ON BRANCH — pending remote review, merge, production Worker deployment, and
runtime verification.**

Implemented on `feat/Anh/public-mutation-origin-boundary`. Nothing below is deployment-verified:
§15.1's four Landing R1 unblock conditions all remain open, and **Landing R1 stays BLOCKED**.
Route-surface attestation is a module-private WeakSet in `cors.ts` (not a `Symbol.for` brand,
which a remote review showed to be forgeable by any module); it attests wiring only and runtime
refusal never depends on it.
No spec convention existed in this repository (`docs/` holds long-lived architecture and
`*-spec.md` feature documents); `specs/active/` is introduced to mirror the paired landing slice
`THG_landingpage:specs/active/R1-vercel-preview-baseline.md` and to keep lifecycle slices out of `docs/`.

| Field | Value |
|---|---|
| Base | `origin/main` @ `5ca17508503a31aab23391a6df90607c3e36157a` ("feat(content): add PostgreSQL preview runtime gates (#73)") |
| Spec branch | `spec/Anh/public-mutation-origin-boundary` |
| Requested by | THG Landing R1 Vercel Preview Qualification (currently BLOCKED FOR IMPLEMENTATION on this slice) |
| Blocking? | No open blockers. One owner confirmation required (§14 R-1) |

---

## 2. Problem

The landing embeds `NEXT_PUBLIC_CMS_API_URL` into browser code and performs public mutations
against it. If a Vercel Preview build carries the production CMS origin, preview browsers can
reach production public write endpoints.

The CMS today has **no origin gate on public writes**. `getAllowedOrigin`
(`src/core/middlewares/cors.ts`) never rejects: an unlisted Origin simply receives
`Access-Control-Allow-Origin: <list[0]>` and **the handler executes in full**. CORS controls
whether a browser may *read* a response; it does not control whether a mutation *runs*.

Two currently-reachable endpoints make this concrete rather than theoretical, because they are
**CORS-simple requests that are never preflighted** — the browser sends them and the store write
happens regardless of the response header:

- `POST /api/v1/community/questions/{slug}/same-issue` — no body, `Accept` only.
- `POST /api/v1/applicant-cv` — `multipart/form-data`, a safelisted Content-Type.

---

## 3. Verified Current State

All citations at `5ca1750`.

**Origin handling on public routes.** `src/core/middlewares/cors.ts` `getAllowedOrigin(requestOrigin)`:
returns the origin when `isLocalhostOrigin` matches; otherwise returns it when present in the
`env.CORS_ORIGIN` list; **otherwise returns `list[0]`**. It never throws and never short-circuits.
`corsHeaders` / `corsJson` / `corsError` / `corsOptions` are response builders only. **No
middleware in the public path rejects a request on Origin.** Origin is optional everywhere.

**Canonical allow-list.** `wrangler.jsonc` → `vars.CORS_ORIGIN = "https://thgfulfill.com,https://www.thgfulfill.com"`,
typed at `src/core/db/env.ts:19` as "comma-separated allowed origins for /api/v1/*". This is the
canonical landing-origin source and **must be reused** — no second list.

**Dev/localhost.** `src/core/middlewares/cors-origin.ts` `isLocalhostOrigin` is a correctly
anchored regex (`http(s)://(localhost|127.0.0.1|[::1])[:port]` only — `http://localhost.evil.com`
does not match). It exists for the landing SEO prerender, whose headless browser performs
**reads only**. It is currently applied to reads *and* writes because `corsHeaders` is shared, and
it is not environment-scoped.

**Decided prior art for this exact question.** `src/core/middlewares/csrf.ts` `requireSafeOrigin()`
already implements origin rejection for admin/state-changing server functions: skips
GET/HEAD/OPTIONS; validates against `env.BASE_URL` + `env.CSRF_ALLOWED_ORIGINS`; auto-allows
localhost only when `!import.meta.env.PROD`; **throws 403 when Origin and Referer are both absent**
("Modern browsers always send one; absence is highly suspicious"); fails closed on
misconfiguration. Its host list is the **CMS admin host** (`cms.thgfulfill.com`), not the landing
origin, so it cannot be called directly from public REST routes — but its *semantics* are the
approved house rule and CMS-P1 must not contradict them.

**Route inventory owner.** `src/openapi/route-classification.ts` classifies every route file, with
`classification`, `auth`, and a mandatory named `consumer`. It is enforced by
`src/openapi/public-surface.test.ts`. This is the canonical inventory the new guard's coverage
must be derived from and checked against.

**Test conventions.** `bun test`, colocated `*.test.ts`; `src/core/middlewares/cors-origin.test.ts`
already exists. CI runs typecheck → `bun test` → build → contract gates (`.github/workflows/pr-ci.yml`).
There is **no HTTP route-handler test harness** in the repository today (§13 CR-3).

---

## 4. Browser Mutation Inventory

Every `PUBLIC_WRITE_API` route at `5ca1750`. Derived from `src/openapi/route-classification.ts`
and verified against the handlers. **Every declared consumer is the landing browser; no route in
this table has a declared server-to-server or non-browser consumer**, and no internal caller of
any of these paths exists in `src/`, `scripts/` or `db/` (only schemas, tests and the generated
route tree reference them).

| # | Method / path | Landing caller | Preflight? | Auth | Turnstile | Rate limit | Store effect |
|---|---|---|---|---|---|---|---|
| 1 | `POST /api/v1/leads` | Next `shared/ui/lead-api.ts`; Vite `lib/cmsClient.ts:348` | **Yes** (JSON) | none | **yes** | 10/IP/h | D1 lead row + Telegram dispatch |
| 2 | `POST /api/v1/community/questions` | Next `community-api.ts` `submitQuestion`; Vite `cmsClient.ts:277` | **Yes** (JSON) | none | **yes** (`guardCommunitySubmit`) | 5/IP/h | D1 question row (pending) + Telegram |
| 3 | `POST /api/v1/community/reviews` | Next `submitReview`; Vite `cmsClient.ts:324` | **Yes** (JSON) | none | **yes** (`guardCommunitySubmit`) | 5/IP/h | D1 review row (pending) + Telegram |
| 4 | `POST /api/v1/community/questions/{slug}/same-issue` | Next `reactSameIssue` | **NO — CORS-simple** | none | **no** (by design) | 30/IP/h | D1 reaction + counter increment |
| 5 | `POST /api/v1/community/questions/{slug}/withdraw` | Next `withdrawQuestion` | **Yes** (JSON) | owner-token | no | 20/IP/h | D1 question state change |
| 6 | `POST /api/v1/community/reviews/{slug}/withdraw` | Next `withdrawReview` | **Yes** (JSON) | owner-token | no | 20/IP/h | D1 review state change |
| 7 | `POST /api/v1/applicants` | Vite `cmsClient.ts:210` (careers dialog) | **Yes** (JSON) | none | **yes** | 5/IP/h | D1 applicant row + Telegram |
| 8 | `POST /api/v1/applicant-cv` | Vite careers dialog | **NO — CORS-simple** (`multipart/form-data`) | none | **no** | 5/IP/h | **R2 object write** under `applicants/` |

Rows 1–6 are reachable from the **Next** landing (therefore from a Vercel Preview of it).
Rows 7–8 are reached from the **Vite** landing today; they are in scope because they are public
browser mutations on the same origin surface and the guard is the same one line.

Out of scope: `POST /api/v1/media/upload` is `AUTHENTICATED_ADMIN_API` (`withRequiredSession("editor")`)
and admin server functions already carry `requireSafeOrigin()`.

---

## 5. Goal

A THG Vercel Preview may read approved production CMS public content while its browser origin is
unable to mutate production CMS state.

Concretely: a disallowed browser Origin on any endpoint in §4 is rejected **before** rate-limit
accounting, body parsing, Turnstile verification, and any D1/R2/Telegram effect.

---

## 6. Explicit Non-Goals

Redesigning CMS authentication · adding authentication to any public write · a double-submit CSRF
token · rewriting the CORS subsystem or changing read/`GET` behaviour · changing any request or
response DTO, OpenAPI shape, or database schema · changing admin/internal mutations · adding
Turnstile where it is absent (§12) · creating a staging/preview CMS environment · dependency or
lockfile changes · reformatting · lint suppressions · any change in the landing repository.

---

## 7. Security Contract

**SC-1 — Allowed browser origin.** An Origin present in the canonical allow-list → the request
proceeds unchanged into its existing rate-limit, Turnstile, owner-token and domain logic. No
existing control is weakened, reordered away, or bypassed.

**SC-2 — Disallowed browser origin.** The request is rejected with `403` before any business
logic or store write. "Rejected" means: no D1 write, no R2 write, no Telegram dispatch, and no
rate-limit counter consumption. The response is built with `corsError`, so it carries correct CORS
headers and `Cache-Control: no-store`.

**SC-3 — Vercel Preview origin.** A `*.vercel.app` (or any other non-listed) origin is disallowed
for production CMS mutations. This requires **no new configuration**: it follows from `CORS_ORIGIN`
not containing it. No preview origin may be added to the production allow-list under this slice.

**SC-4 — Reads unchanged.** `GET`/`HEAD` behaviour, response bodies, caching and the localhost
read allowance for the landing prerender are untouched.

**SC-5 — Preflight unchanged for allowed origins.** `OPTIONS` responses for allowed origins are
byte-identical to today. The guard applies to the mutating method, not to preflight.

**SC-6 — Explicit limitation.** Origin validation is **not authentication**. It constrains
*browsers*, which set `Origin` unforgeably. It does **not** protect against a non-browser HTTP
client (curl, a script, a server) that constructs its own headers. Any claim that CMS-P1 makes
these endpoints "secure" is out of contract; it makes *preview-browser* mutation impossible, which
is exactly what Landing R1 requires and no more.

---

## 8. Origin Semantics

**Canonical source.** `env.CORS_ORIGIN` — the existing landing allow-list (§3). No new
environment variable, no second list. `env.CSRF_ALLOWED_ORIGINS` is **not** reused: it lists
CMS-admin hosts, and merging the two surfaces would let an admin host mutate as a landing origin.

**Decision table.**

| Origin on a §4 endpoint | Result | Basis |
|---|---|---|
| Present and in `CORS_ORIGIN` | proceed (SC-1) | canonical allow-list |
| Present, not in `CORS_ORIGIN` (incl. any `*.vercel.app`) | **403 before mutation** | SC-2/SC-3 |
| Localhost/loopback, **non-production build** (`!import.meta.env.PROD`) | proceed | mirrors `csrf.ts` dev wildcard; keeps `bun dev` and local landing dev working |
| Localhost/loopback, **production build** | **403** | the localhost echo exists for the read-only prerender (§3); a production write from a loopback page is not a declared consumer |
| **Absent** | **403** | §8.1 |
| `CORS_ORIGIN` empty/unset | **fail closed → 403** | mirrors `requireSafeOrigin`'s misconfiguration branch; today's `getAllowedOrigin` returns `"*"` in that case, which must not become a write allowance |

### 8.1 Missing Origin — conclusion

**Reject.** This is not a guess; it is the smallest rule backed by the current callers plus an
already-decided house rule:

1. Every §4 endpoint declares exactly one consumer class — the landing browser
   (`route-classification.ts`), and no internal or external non-browser caller exists in the repo.
2. Browsers always attach `Origin` to cross-origin `POST`, and all landing→CMS calls are
   cross-origin.
3. `src/core/middlewares/csrf.ts` already rejects state-changing requests with neither Origin nor
   Referer, on precisely this reasoning, and that behaviour is in production for admin mutations.
4. `same-issue` already refuses an unidentifiable client (`ip === "unknown"` → 400) rather than
   pooling it — the codebase's stance on unidentified mutation callers is refusal, not tolerance.

**Deviation from `csrf.ts`, deliberate:** no `Referer` fallback for public writes. Every declared
consumer is a cross-origin browser that always sends `Origin`; `Referer` is routinely stripped by
privacy settings and is the weaker signal. Fewer branches, no compatibility cost from any caller
evidenced in either repository.

**Residual risk:** the repository cannot prove the absence of an *undeclared, out-of-repo* caller
(an ops script, a manual Postman flow, a partner integration) that POSTs without an Origin. That
is R-1 in §14 — an owner confirmation, not a discovery task.

---

## 9. Expected Code Ownership

Reuse existing owners. Create no new module tree.

| Concern | Owner | Action |
|---|---|---|
| Pure origin predicate | `src/core/middlewares/cors-origin.ts` (already the home of the pure, env-free predicate, split out precisely so it is unit-testable) | **extend** with the mutation-origin predicate |
| Guard returning the 403 response | `src/core/middlewares/cors.ts` (owns `env.CORS_ORIGIN` reading and `corsError`) | **extend** with one guard function |
| Community shared handlers | `src/features/community/community.http.ts` (`guardCommunitySubmit`, `handleCommunityWithdraw`) | **call the guard first** — covers endpoints 2, 3, 5, 6 |
| Individual public write routes | `leads/index.ts`, `applicants/index.ts`, `applicant-cv/index.ts`, `community/questions/$slug.same-issue.ts` | **call the guard first** |
| Route inventory | `src/openapi/route-classification.ts` | source of truth for which routes must be guarded; note may be updated, classification must not change |

---

## 10. Expected Implementation Diff

Six edit sites cover all eight endpoints, plus tests.

| File | Change |
|---|---|
| `src/core/middlewares/cors-origin.ts` | + pure predicate: allowed-origin decision from `(origin, allowList, isProd)`. No `cloudflare:workers` import |
| `src/core/middlewares/cors.ts` | + guard reading `env.CORS_ORIGIN`, returning `corsError(request, 403, …)` or `null` |
| `src/features/community/community.http.ts` | + guard call as the **first** statement of `guardCommunitySubmit` and `handleCommunityWithdraw` |
| `src/routes/api/v1/(public)/leads/index.ts` | + guard call as the first statement of `POST` |
| `src/routes/api/v1/(public)/applicants/index.ts` | + guard call as the first statement of `POST` |
| `src/routes/api/v1/(public)/applicant-cv/index.ts` | + guard call as the first statement of `POST` |
| `src/routes/api/v1/(public)/community/questions/$slug.same-issue.ts` | + guard call as the first statement of `POST`, before the `ip === "unknown"` check |

**Ordering is contractual:** the guard runs before rate limiting. A disallowed origin must not
consume a victim IP's rate-limit budget or reach the Durable Object.

**Do not touch:** `package.json`, `bun.lock`, `wrangler.jsonc` (the allow-list value is unchanged),
`db/**`, any `*.schemas.ts`, `src/openapi/paths.ts`, `src/core/middlewares/csrf.ts`,
`src/core/middlewares/rate-limit.ts`, admin routes, `src/routeTree.gen.ts`, and the landing repository.

Expected size: **well under 100 changed lines** excluding tests.

---

## 11. Required Tests

`bun test`, colocated. A test that asserts only an HTTP status while the mutation still runs does
not satisfy this section — every rejection test must assert **absence of the store effect**.

| ID | Test | Assertion |
|---|---|---|
| T-1 | Pure predicate, `src/core/middlewares/cors-origin.test.ts` | allow-listed origin → allow; unlisted → deny; `*.vercel.app` → deny; missing → deny; loopback with `isProd=false` → allow; loopback with `isProd=true` → deny; empty allow-list → deny (fail closed); case/trailing-whitespace handling matches `CORS_ORIGIN` parsing |
| T-2 | Allowed production origin, each §4 endpoint | guard returns "proceed"; the existing rate-limit / Turnstile / owner-token / domain path is entered unchanged |
| T-3 | Disallowed arbitrary origin, each §4 endpoint | 403 **and** the feature's mutation function (`createLead`, `createCommunityQuestion`, `addSameIssueReaction`, `createApplicant`, `env.MEDIA.put`, withdraw) is **never invoked** — asserted with a spy/mock, not inferred from status |
| T-4 | Representative Vercel Preview origin (e.g. `https://thg-landing-git-migration-next-main-<team>.vercel.app`) | same as T-3: 403, no mutation |
| T-5 | Read endpoint (`GET /api/v1/homepage` or similar) from a disallowed origin | unchanged status and body; guard not applied |
| T-6 | Rate limit not weakened | allowed origin still hits its existing cap; disallowed origin does **not** decrement the counter (rate-limiter not called) |
| T-7 | Turnstile not weakened | allowed origin with an invalid token still 403s via `verifyTurnstile`; the origin guard neither replaces nor short-circuits it |
| T-8 | CORS response semantics for allowed origins | `OPTIONS` preflight and success responses keep today's headers (`Access-Control-Allow-Origin`, `Vary: Origin`) |
| T-9 | Missing-Origin rejection | 403 and no mutation, with a comment citing §8.1 and R-1 as the justification |
| T-10 | Coverage gate | every `PUBLIC_WRITE_API` entry in `route-classification.ts` is guarded — a new public write route added without the guard fails the suite. Extends `src/openapi/public-surface.test.ts` or a sibling |

T-10 is what stops this boundary from decaying: it makes the classification inventory the
enforcement source rather than a list someone must remember to update.

---

## 12. Negative Tests

Covered by T-3, T-4, T-6, T-7, T-9 above; restated as the explicit must-fail matrix:

| Condition | Must observe |
|---|---|
| Arbitrary origin → `POST /leads` | 403; no D1 lead row; no Telegram dispatch |
| Preview origin → `POST /community/questions/{slug}/same-issue` (the non-preflighted path) | 403; counter unchanged; no reaction row |
| Preview origin → `POST /applicant-cv` (the non-preflighted multipart path) | 403; **no R2 object written** |
| Preview origin → `POST /community/{questions,reviews}` | 403; no pending row created |
| Preview origin → `POST /community/*/withdraw` with a valid owner token | 403; item state unchanged |
| No Origin header → any §4 endpoint | 403; no store effect |
| Allowed origin, invalid Turnstile | still 403 from Turnstile (control intact, not replaced) |
| Allowed origin, over rate limit | still 429 (control intact) |
| Disallowed origin, repeated | rate-limit counter for that IP unchanged |

---

## 13. Compatibility Risks

**CR-1 — Undeclared non-browser caller.** If an out-of-repo client POSTs without an Origin (or with
an unlisted one), it breaks. No such caller is evidenced in either repository (§4). Mitigation:
R-1 owner confirmation before merge; the failure mode is a loud 403 with a distinct error code, so
it is diagnosable from Workers Logs (`observability.enabled: true` in `wrangler.jsonc`).

**CR-2 — Loopback writes in production stop working.** Intentional (§8). The prerender is
read-only, so no evidenced consumer is affected.

**CR-3 — No HTTP route-handler test harness exists.** T-3/T-4 must assert non-invocation of the
mutation functions via module mocking at the handler level, or the guard must be structured so the
decision is testable without an HTTP round trip. Implementation must not substitute a
status-only test because the harness is missing.

**CR-4 — Multiple landing apps.** Vite (production) and Next (migration) both call these
endpoints from `https://thgfulfill.com`. Both remain allowed; the allow-list value does not change.

---

## 14. Explicit Blockers

**No blocking unknowns.** One confirmation is required before merge:

**R-1 — Owner confirmation (not a discovery task).** Confirm that no operational or partner
process POSTs to any §4 endpoint from a non-browser client or without an `Origin` header. The
repository proves no such caller exists in code; it cannot prove one does not exist outside it.
If one is confirmed, the smallest compatible amendment is to add that caller's origin to
`CORS_ORIGIN`, **not** to relax the missing-Origin rule.

**FOLLOW-UP SECURITY DEBT — recorded, deliberately not fixed here:**

- `verifyTurnstile` (`src/core/middlewares/rate-limit.ts`) returns `true` for **any non-empty
  token, including the literal `DEV_BYPASS`, whenever `TURNSTILE_SECRET_KEY` is unset**. The key is
  a Wrangler secret (`src/core/db/env.ts:24` types it optional; `.dev.vars` is gitignored; it is
  absent from `wrangler.jsonc` and from `.github/workflows/deploy.yml`). **Its presence in the
  production Worker cannot be proven from any repository or deployment configuration available
  locally** — it requires an operator check against the deployed Worker's secret list. CMS-P1 does
  not depend on it: the origin boundary rejects before Turnstile runs.
- `POST /api/v1/applicant-cv` is an unauthenticated R2 write with no Turnstile. Already recorded
  as "STILL OPEN" in `route-classification.ts`; adding Turnstile changes the request contract and
  needs a coordinated landing change. Out of scope here.

Neither item blocks CMS-P1 or the Landing R1 unblock, because both concern *what an allowed
origin may do*, while CMS-P1 governs *which origins reach that logic at all*.

---

## 15. Definition of Done

1. §10 implemented; diff stays within the listed files.
2. T-1..T-10 pass; T-3/T-4/T-9 assert non-invocation of the mutation functions.
3. `bun run typecheck`, `bun test`, `bun run build`, `bun run check:openapi-drift` green; PR CI gate green.
4. `route-classification.ts` classifications unchanged; T-10 coverage gate active.
5. R-1 confirmed and recorded in the PR.
6. Merged to CMS `main`.
7. Deployed to the production Worker, with a probe from a disallowed origin observed returning 403.

### 15.1 Landing R1 unblock condition

Landing R1 may move **BLOCKED FOR IMPLEMENTATION → READY FOR IMPLEMENTATION** only when **all** of
the following are evidenced:

1. CMS-P1 is **merged to CMS canonical `main`** — and **deployed to the production Worker**. Merged
   is not sufficient; the boundary must be live where `NEXT_PUBLIC_CMS_API_URL` points.
2. Tests prove a disallowed origin — **including a representative Vercel Preview origin** — cannot
   mutate: 403 **and** no store write (T-3, T-4, and the §12 must-fail matrix).
3. The production landing origin still performs every §4 mutation successfully (T-2), verified
   against the deployed Worker.
4. Landing Preview requires **no mutation credential** of any kind — CMS-P1 adds no token, header
   or secret to the client contract.
5. `CMS_API_URL` remains usable unchanged for approved server-side reads (this slice does not
   touch `GET`).
6. Only then may Landing Preview set `NEXT_PUBLIC_CMS_API_URL` to the production CMS origin, and
   only under the explicitly recorded scope of **SC-6**: the boundary makes *preview-browser*
   mutation impossible; it does not make the endpoints resistant to a non-browser client. If the
   owner requires resistance to non-browser clients, R1 must keep a non-production write origin
   instead, and CMS-P1 does **not** unblock that stronger requirement.

If any of 1–5 is unproven, **do not claim Landing R1 is unblocked.**

---

## 16. Implementation-Agent Guardrails

1. `git fetch origin`; re-verify §3 and §4 against current `origin/main`, not against `5ca1750`.
   If evidence contradicts a contract, **stop and report** — do not adapt code to fit the spec.
2. Confirm R-1 is recorded before merging.
3. Reuse `env.CORS_ORIGIN`. Do **not** introduce a new environment variable, a second allow-list,
   or a merge with `CSRF_ALLOWED_ORIGINS`.
4. Put the guard **first** in every handler — before rate limiting, body parsing and Turnstile.
5. Change no read path, no DTO, no schema, no OpenAPI shape, no auth architecture, no dependency,
   and nothing in the landing repository.
6. Do not add Turnstile to `applicant-cv` or `same-issue` in this slice (§14).
7. Do not weaken or reorder any existing control to make a test pass.
8. Never assert only an HTTP status for a rejection — assert the mutation function was not called
   (§11, CR-3).
9. Keep the diff quiet: no reformatting, no lint suppressions, no unrelated refactors.
10. Report contract by contract (SC-1..SC-6) and test by test (T-1..T-10) with evidence, plus the
    deployed-Worker 403 probe required by §15.7. State plainly anything unproven.
