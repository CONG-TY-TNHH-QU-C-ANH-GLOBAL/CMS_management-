# THG Community — Flow Diagrams

Mermaid diagrams for the six core flows. File references are CMS-side unless
prefixed with `landing:`. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the
role map.

## A. Public submit flow

Applies to both Q&A (`POST /api/v1/community/questions`) and Reviews
(`POST /api/v1/community/reviews`).

```mermaid
sequenceDiagram
    actor User
    participant Form as landing: Ask/SubmitReview dialog
    participant API as CMS public POST route
    participant Guard as guardCommunitySubmit (community.http.ts)
    participant Svc as domain service (community[.reviews].service.ts)
    participant Repo as community.repo.ts
    participant D1 as D1

    User->>Form: fill form + Turnstile
    Form->>API: POST JSON
    API->>Guard: rate-limit 5/hr, parse, Zod schema, Turnstile verify
    Guard-->>API: {ip, data} or early 4xx Response
    API->>Svc: createCommunityQuestion / createCommunityReview
    Svc->>Repo: prepareCommunitySubmission (category resolve, UTM json, mint owner token + hash)
    Svc->>Repo: insertWithUniqueSlug (slugify + one-shot collision retry)
    Repo->>D1: INSERT status='pending', owner_token_hash
    D1-->>Svc: {id, slug}
    Svc-->>API: {id, slug, ownerToken (raw, one-time)}
    API-->>Form: {ok, id, slug, status:'pending', owner_token}
    Form->>Form: rememberOwnerToken → localStorage thg_community_owner_v1
    Form-->>User: "pending moderation" success panel
```

## B. Public read flow

```mermaid
sequenceDiagram
    participant Page as landing: list/detail page
    participant Hook as landing: useCommunity* (react-query)
    participant API as CMS public GET route
    participant H as handleCommunityList / handleCommunityDetail
    participant Repo as community.repo.ts
    participant Map as community.mappers.ts

    Page->>Hook: render (list: 15s staleTime, detail: 5m)
    Hook->>API: GET /community/{questions|reviews}[/{slug}][?category=]
    API->>H: request
    H->>Repo: listPublishedJoined / getPublishedJoinedBySlug (status='published' AND withdrawn_at IS NULL)
    Repo-->>H: joined rows
    H->>Map: whitelist projection (drops email/ip/ua/utm/token-hash/private_*)
    Note over Map: indexable computed server-side<br/>via community.policy.ts
    Map-->>H: public shape
    H-->>Hook: {questions|reviews|question|review}
    Hook-->>Page: data → UI, SeoHead noindex={!indexable}, JSON-LD
```

## C. Admin moderation flow

```mermaid
sequenceDiagram
    actor Op as Operator
    participant UI as admin page (/admin/content/community[/reviews])
    participant Act as community.actions.ts (editor session required)
    participant Svc as domain service
    participant D1 as D1

    Op->>UI: review pending item
    UI->>Act: updateCommunity*StatusFn {id, status}
    Act->>Svc: setCommunity*Status
    Svc->>D1: UPDATE status (+ stamp published_at on first publish)
    Op->>UI: write expert answer / public summary + verified checkbox
    UI->>Act: saveCommunityExpertAnswerFn / saveCommunityReviewModerationFn
    Act->>Svc: save (Q&A asserts: verified ⇒ answer exists)
    Svc->>D1: UPDATE
    Note over D1: public visibility + indexability change<br/>on next public GET (no cache invalidation needed:<br/>landing lists use 15s staleTime)
```

## D. Withdraw flow

```mermaid
sequenceDiagram
    actor Owner as Submitter (same browser)
    participant Page as landing: detail page
    participant LS as localStorage
    participant API as CMS withdraw POST route
    participant H as handleCommunityWithdraw (rate-limit 20/hr)
    participant Repo as withdrawOwnedBySlug (community.repo.ts)
    participant D1 as D1

    Page->>LS: getOwnerToken(slug | review:{slug})
    LS-->>Page: raw token (withdraw button shown only if present)
    Owner->>Page: click withdraw + confirm
    Page->>API: POST {ownerToken}
    API->>H: guard
    H->>Repo: withdraw(slug, ownerToken)
    Repo->>D1: SELECT owner_token_hash WHERE slug AND withdrawn_at IS NULL
    Repo->>Repo: sha256(presented) === stored hash?
    alt match
        Repo->>D1: UPDATE withdrawn_at = unixepoch()
        H-->>Page: 200 ok
        Page->>LS: forgetOwnerToken
        Note over D1: excluded from public list/detail/sitemap<br/>from the next read on
    else no match / not found
        H-->>Page: generic 404 (no ownership enumeration)
    end
```

## E. SEO / prerender flow

```mermaid
flowchart LR
    B[landing build] --> SM[prebuild: generate-sitemap.ts]
    B --> PR[postbuild: prerender.mjs]
    SM -->|GET /community/questions + /reviews| CMS[(CMS public GET)]
    PR -->|same GETs| CMS
    CMS -->|payloads include server-computed indexable| F{indexable === true?}
    F -->|yes| URLS["detail URLs × 3 langs"]
    F -->|no| DROP[excluded]
    URLS --> XML[sitemap.xml]
    URLS --> HTML[prerendered HTML]
    HTML --> JLD["JSON-LD: QAPage (only with expert answer),<br/>Review (only indexable + rated), Breadcrumb"]
    DROP -.-> NOIDX["runtime pages render with noindex<br/>(also the loading/404 default)"]
```

## F. Future AI moderation flow (design target — not built)

The AI pipeline slots between the submit guard and the moderation state
machine. It may only *propose*; publishing stays behind the policy engine
and (for anything user-visible) human review.

```mermaid
flowchart TD
    S[Submit accepted → status='pending'] --> DET[Deterministic checks<br/>length, links, banned patterns, dup slug/content]
    DET -->|hard fail| REJ[auto_reject + reason logged]
    DET -->|pass| LLM[LLM classifier<br/>spam / off-topic / trust-relevant / evidence claims]
    LLM --> EV[Evidence resolver<br/>order ref lookup, prior history, category fit]
    EV --> PE{Policy engine<br/>explicit rules, versioned}
    PE -->|clear + low risk| ACC[auto_accept → still pending human verify stamp]
    PE -->|ambiguous| NR[needs_review → admin queue, AI notes attached]
    PE -->|violation| REJ2[reject → admin can override]
    PE -->|verified evidence, Reviews only| AV[auto_verify proposal → operator confirms]
    ACC & NR & REJ2 & AV --> LOG[(AI decision log:<br/>own table, prompt_version, model, evidence)]
```

Boundary rules for this pipeline (agreed before any code):

- AI writes to its **own** tables/log — never mutates public shapes directly.
- `verified` remains an operator (or operator-confirmed) stamp.
- Every AI decision is logged with prompt/model version for audit.
- The deterministic layer runs first; the LLM is never the only gate.
