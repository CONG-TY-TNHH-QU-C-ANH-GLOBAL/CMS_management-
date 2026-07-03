# THG Community — Reuse Boundaries

What future community features (Smart Moderation, AI Verification, Submission
Status, Shipping Database) must **reuse**, and what must stay **explicit and
domain-specific**. The dividing line: shared files hold *mechanics*, domain
files hold *policy*. If a helper needs an `if (isReview)` branch, it is
policy leaking into a mechanic — split it back out.

## CMS reusable mechanics (reuse these, do not re-implement)

| Mechanic | Where | Notes |
|---|---|---|
| Owner-token generate/hash/verify | `community.owner.ts`, verify inside `withdrawOwnedBySlug` | 256-bit token, SHA-256 hash stored, raw returned once. |
| Slug uniqueness + retry | `community.slug.ts` + `insertWithUniqueSlug` (`community.repo.ts`) | Vietnamese-safe slugify, one-shot collision retry. |
| Public list/detail query helpers | `listPublishedJoined`, `getPublishedJoinedBySlug` (`community.repo.ts`) | Enforce `status='published' AND withdrawn_at IS NULL` in one place. |
| Admin query helper | `listAdminJoined` (`community.repo.ts`) | All statuses incl. withdrawn, capped 500. |
| Withdraw by owner | `withdrawOwnedBySlug` (`community.repo.ts`) | Hash compare + soft delete; generic-404 behavior lives in the HTTP layer. |
| Status transition | `setStatusById` (`community.repo.ts`) | Stamps `published_at` on first publish. |
| Submission prologue | `prepareCommunitySubmission` (`community.repo.ts`) | Category resolve + UTM serialize + token mint. |
| Public HTTP handlers | `handleCommunityList/Detail/Withdraw`, `guardCommunitySubmit` (`community.http.ts`) | Rate-limit, JSON parse, Zod, Turnstile — routes stay thin. |
| Admin moderation UI kit | `src/components/cms/moderation.tsx` | Tabs, badges, status select, meta row, empty state, `tallyStatuses`, time format. |
| Privacy whitelist mapper pattern | `community.mappers.ts` | New domains get their own `toPublicXSummary/Detail` pair + absence tests. Pattern, not a generic function. |
| OpenAPI GET-only convention | `paths.ts` + `community.schemas.ts` + `check:openapi-drift` | Register GETs against canonical Zod schemas; POSTs stay hand-written. |
| Status/indexability policy boundary | `community.policy.ts` | New domains add their own `isXIndexable` here — never inline in mappers/routes. |

## CMS domain-specific logic that must stay explicit

Do **not** fold these into shared helpers or a generic "community entity":

- **Q&A expert answer policy** (`community.service.ts`): verified ⇒ answer
  exists (`assertExpertAnswerInvariant`), same-issue reactions, answer-gated
  indexability.
- **Review verification policy** (`community.reviews.service.ts` +
  `community.policy.ts`): rating, operator `public_summary`, private
  evidence fields, ≥60-char body indexability floor.
- **Future shipping experience policy**: route/carrier semantics get their
  own service + policy entries beside (not inside) Q&A/Reviews.
- **Future AI evidence policy**: which evidence auto-verifies what is a
  versioned policy-engine concern, never a mapper/repo concern.

## Landing reusable mechanics

| Mechanic | Where |
|---|---|
| Community tabs (Q&A ↔ Reviews) | `src/components/community/CommunityTabs.tsx` |
| Category filter chips | `CommunityCategoryFilters` (`communityPageBits.tsx`) |
| Loading/error/empty states, badges | `communityPageBits.tsx` (+ page-level patterns) |
| Submit dialog shell (trigger, done/form swap, success panel) | `CommunitySubmitDialog`, `SubmitSuccess` (`communityFormBits.tsx`) |
| Form fields (text, textarea, name/email grid, category select, submit button, Turnstile) | `communityFormBits.tsx` |
| Submit orchestration (validate → Turnstile → post → done) | `useCommunitySubmitDialog`, `resolveCommunitySubmitToken` (`communitySubmit.ts`) |
| Form state | `useFormFields` (`src/hooks/useFormFields.ts`) |
| Owner-token storage (namespaced) | `src/lib/communityOwner.ts` (`thg_community_owner_v1`, `reviewOwnerKey`) |
| Withdraw mechanics (token check → confirm → POST → forget → invalidate → redirect) | `useCommunityWithdraw` (`src/components/community/communityWithdraw.ts`) + `CommunityWithdrawButton` (`communityPageBits.tsx`); endpoint/copy/keys stay page-owned |
| Public list queries, short staleTime | `useCommunity*` hooks in `useCmsContent.ts` (lists 15s, details 5m) |
| SEO utilities | `SeoHead` noindex, `JsonLdQaPage`/`JsonLdReview`/`JsonLdBreadcrumb` (`src/components/seo/JsonLd.tsx`) |
| i18n | `tr` helper + `useI18n` (`src/lib/i18n.tsx`), CMS-overridable keys |

## Landing domain-specific logic that must stay explicit

- **Q&A**: question copy, expert-answer rendering, same-issue button.
- **Reviews**: rating input/stars, verified badge semantics, public summary.
- **Future submission status**: its own page/copy consuming a new
  server-computed status field — not derived client-side.
- **Future shipping route filters**: their own filter component; do not
  generalize `CommunityCategoryFilters` into a filter framework.
- **Future compare-page SEO copy**: page-owned, not a shared SEO helper.

## Reuse survey (state as of Sprint 4.25)

| Area | Existing reusable helper/component | Current consumers | Future features reuse? | Refactor now or later? | Risk |
|---|---|---|---|---|---|
| CMS `community.repo.ts` | 7 table-parameterized helpers (submit prologue, slug insert, withdraw, status, 3 query helpers) | Q&A + Reviews services | **Yes** — Shipping DB, Submission Status | Nothing needed now | Low |
| CMS `community.http.ts` | list/detail/withdraw handlers + submit guard | All 10 public routes | **Yes** — any new public community endpoint | Nothing needed now | Low |
| CMS `community.owner.ts` | `generateOwnerToken`, `hashOwnerToken` | Submit prologue, withdraw | **Yes** — any owner-withdrawable content | Nothing needed now | Low |
| CMS `community.mappers.ts` | Per-domain whitelist mappers + `toExcerpt`, `toCategoryRef` | Public GET routes | **Pattern yes, function no** — new domains add their own pair | Later, only when a 3rd domain lands | Low |
| CMS `community.policy.ts` | `isIndexable`, `isReviewIndexable`, invariant | Mappers, admin actions | **Yes** — add `isXIndexable` per domain here | Nothing needed now | Low |
| CMS reviews policy/service | Explicit review moderation + verification | Reviews routes + admin | **No** — domain policy stays explicit | Never merge with Q&A | Low |
| CMS Q&A service | Explicit Q&A policy incl. same-issue | Q&A routes + admin | **No** — domain policy stays explicit | Never merge with Reviews | Low |
| CMS admin moderation components | `moderation.tsx` kit (tabs, badges, select, meta, empty) | Both admin pages | **Yes** — any new moderation queue | Nothing needed now | Low |
| CMS `routes/api/v1/(public)/community` | Thin route wiring convention | 10 endpoints | **Yes** — copy the wiring shape, not the code | Nothing needed now | Low |
| Landing `communityFormBits.tsx` | 8 shared form primitives + dialog shell | Both submit dialogs | **Yes** — shipping-experience form | Nothing needed now | Low |
| Landing `communityPageBits.tsx` | Category filters, review badges | Both list pages, review detail | **Yes** | Nothing needed now | Low |
| Landing `communitySubmit.ts` | Submit orchestration hook | Both dialogs | **Yes** | Nothing needed now | Low |
| Landing `communityOwner.ts` | Namespaced token storage | Dialogs + detail pages | **Yes** — new namespaces via `xOwnerKey` pattern | Nothing needed now | Low |
| Landing `useFormFields.ts` | Generic string-field state | Both dialogs | **Yes** | Nothing needed now | Low |
| Landing cmsClient/cmsSchemas/hooks | Typed client + Zod parse + react-query hooks | All community pages | **Yes** — add hooks per endpoint | Nothing needed now | Low |
| Landing sitemap/prerender | indexable-gated URL expansion ×3 langs | Build pipeline | **Yes** — new indexable content types append here | Nothing needed now | Medium (build-time coupling to live CMS) |
| Landing JsonLd helpers | QAPage/Review/Breadcrumb emitters | Community pages | **Yes** — new schema.org types as new components | Nothing needed now | Low |
| Landing i18n `tr` | Locale-triple dictionary + CMS override | All pages | **Yes** | Nothing needed now | Low |

**Survey conclusion:** Sprint 4's duplication refactors already landed the
right boundaries. No copy-paste debt found between Q&A and Reviews on either
side. No refactor is required before Smart Moderation work starts; the risk
to watch is *future* erosion (policy creeping into shared mechanics), which
these docs exist to prevent.
