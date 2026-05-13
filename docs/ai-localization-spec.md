# AI-Assisted Localization Pipeline — Spec v4.2 (FINAL)

> **Status**: Design frozen, operational risks documented, READY TO CODE.
> **Owner**: vuongnguyen.hao@gmail.com
> **Last revised**: 2026-05-14 (v4.2 — operational safety: malformed JSON recovery, per-locale partial failure, duplicate draft protection)
> **Implementation target**: cmsthgfulfill (CMS) + THG_landingpage (consumer, no changes)
>
> No further design rounds. Remaining unknowns are operational and will be
> learned from FAQ POC behavior in production. After v4.2 the rule is:
> **stop designing, start validating reality.**

This document supersedes the v1 inline spec from chat. Read this first before
touching any AI translation code in this repo.

---

## 0. Decision log

| Version | Decision | Rationale |
|---------|----------|-----------|
| v1 | ALTER TABLE on every content table to add `reviewed_at`, `ai_generated_at`, `source_locale` | Simple but pollutes schema |
| **v2** | **Separate semi-generic `{entity}_translations` tables** | Clean schema, scales to unlimited locales, audit-friendly |
| v1 | Worker returns raw drafts to UI; UI persists on save | UI-driven persistence = risk of lost work on refresh |
| **v2** | **Worker creates draft rows immediately, returns IDs** | Audit-able, retry-able, refresh-safe |
| v1 | reviewed_at only | Cannot answer "who approved this AI copy?" |
| **v2** | **reviewed_by + reviewed_at + ai_model + prompt_version** | Full traceability |
| v1 | No source change detection | Editing VI silently invalidates EN/ZH |
| **v2** | **source_hash on every translation row + stale badge** | Operator sees `⚠ Source updated — needs re-translation` |
| v1 | Glossary naive replace | "Kho Trung Quốc" + "Kho" → conflict on substring match |
| **v2** | **Glossary longest-first matching** | Deterministic, no collisions |
| v1 | Audit log = generic `audit_log` | Cannot track tokens/cost/latency |
| **v2** | **Dedicated `ai_translation_log` table** | Token analytics, model A/B, retry stats |
| v2 | Translation log stores only parsed result | Cannot debug malformed JSON / hallucinated fields |
| **v3** | **`raw_response_json` on every log row** | Full AI output preserved for postmortem |
| v2 | State inferred from `reviewed_at` + hash mismatch at read time | UI logic forks across 3 flags, queries get awkward |
| **v3** | **Explicit `status` enum: `draft \| reviewed \| stale \| failed`** | Single source of truth, simple `WHERE status = …` filters |
| v2 | Hash raw source string | Whitespace edits (trailing space, `\r\n`) trigger false stale |
| **v3** | **Hash _normalized_ content (trim + LF + collapsed spaces)** | Stable hash across cosmetic edits |
| v2 | Translation row has source_hash only | Reviewer cannot see which VI text the AI translated from |
| **v3** | **`source_snapshot` column stores VI content at translate time** | Reviewer sees exact source; debugs `is-the-translation-correct-for-this-version` |
| v1/v2 | Locale fallback unspecified | API behavior undefined when reviewed translation missing |
| **v3** | **NO cross-locale fallback in public API** | Missing → API returns no row → landing's `i18n.tsx` static default kicks in. Keeps locale boundaries clean for SEO. |
| v2 | Edit to approved row silently overwrites | Audit chain breaks, accountability lost |
| **v3** | **Edit demotes status `reviewed → draft`** | Requires re-approval; audit_log captures diff |
| v3 | Create faq + service_block + testimonial translation tables in Phase 1 | Premature — schema unvalidated against real workflow |
| **v4** | **Phase 1 ships ONLY `faq_translations` + `glossary` + `ai_translation_log`** | Validate review UX / stale lifecycle / edit behavior on FAQ first; generalize schema in Phase 2 with lessons baked in |
| v3 | `source_snapshot TEXT NOT NULL` | Historical migrated rows have no clean snapshot |
| **v4** | **`source_snapshot TEXT NULL` initially**, tighten to NOT NULL later | Backfill-friendly; legacy human-authored rows just leave it NULL |
| v3 | `tokens_in`/`tokens_out` only on log | Dashboards have to recompute cost from token prices |
| **v4** | **`estimated_cost_usd REAL` stored at write time** | Direct quota / anomaly queries; freezes the price used at the time of call (model pricing changes over time) |
| v3 | Normalize whitespace only | Markdown bullet edits (`-  item` ↔ `- item`) still false-stale |
| **v4** | **Normalize markdown bullet spacing + trailing whitespace too** | Bullet/list cosmetic edits no longer invalidate |
| v3 | State mutations scattered across UI/API/worker | Inevitable drift — different code paths transition `status` differently |
| **v4** | **Single `transitionTranslationStatus()` service** | Only one place writes `status`; valid transitions enforced |
| v4 | Log row has no link to the translation rows it produced | Retry lineage / correlation queries require manual JOIN by entity+timestamp |
| **v4.1** | **`target_translation_ids TEXT` JSON array on log** | Direct correlation: one log row → N translation row IDs |
| v4 | `status='stale'` carries no reason | Operator can't distinguish "source edited → re-translate" from "prompt v2 deployed → re-translate" |
| **v4.1** | **`stale_reason` column** (`source_changed \| prompt_changed \| model_changed \| manual_mark`) | Stale UI badge tells operator which response is appropriate |
| v4 | Glossary is flat list | Grows past ~50 entries and admin UX becomes unscannable |
| **v4.1** | **`category` column on glossary** (shipping/warehouse/ecommerce/payments/marketing/brand/general) | Group + filter in admin; clearer mental model |
| v4 | Glossary matching policy implied | Future risk: someone adds fuzzy/case-insensitive logic and breaks deterministic injection |
| **v4.1** | **Explicit policy: exact phrase, case-sensitive, no fuzzy** | Documented + enforced in matcher; no surprises |
| v4 | Transition matrix lives in code only | Future readers must read TS to know valid transitions |
| **v4.1** | **Explicit transition table in spec §4.5** | Source of truth for reviewers; code mirrors it |
| v4.1 | One translate call = atomic (all locales succeed or all fail) | If ZH fails, EN draft is also discarded — wasteful + bad UX |
| **v4.2** | **Per-locale partial failure**: each locale gets its own row + outcome | EN can land as `draft` even if ZH errors as `failed` |
| v4.1 | Single JSON.parse attempt; failure → bubbles up | OpenAI wraps JSON in markdown fences ~10% of the time |
| **v4.2** | **Malformed JSON recovery: 1 retry with stricter prompt, then `failed` + raw_response_json** | Most common failure mode handled gracefully |
| v4.1 | No protection against 2 admins clicking translate simultaneously | Race creates duplicate drafts or status overwrite |
| **v4.2** | **Duplicate draft protection**: pre-check existing rows in transaction; reuse if `status='draft'`, reject if in-flight | Deterministic UX, no orphan drafts |
| v4.1 | Transition logic = single function | Pure validation tangled with I/O; hard to test |
| **v4.2** | **`validateTransition()` pure + `applyTransition()` side-effects** | Matrix is unit-testable in isolation |
| v4.1 | Migration sets all existing en/zh rows to identical fields | Cannot distinguish "human-authored from 2025" from "AI-translated and reviewed in 2026" |
| **v4.2** | **Migration preserves origin: `ai_generated_at=NULL`, `source_snapshot=NULL`, `reviewed_by=NULL`** | AI rows have these populated; humans don't. Analytics queries stay clean. |

---

## 1. Architectural pillars (must not change)

1. **Vietnamese is canonical** — every translation references a VI source row. EN/ZH are derived artifacts.
2. **Pre-stored, never runtime** — landing fetches pre-translated DB content; no AI calls in request path.
3. **Review-gated** — AI-generated rows with `reviewed_at IS NULL` are NEVER served by the public API.
4. **Glossary injection** — every prompt prepends the glossary to lock branding/SEO terms.

These four pillars are non-negotiable. Everything below is implementation detail that can evolve.

---

## 2. Architecture overview

```
┌──────────────┐   1. Save VI row     ┌────────────────────┐
│  Admin UI    │ ───────────────────▶ │   CMS Worker       │
│  (FAQ form)  │                      │  (TanStack Start)  │
└──────┬───────┘                      └────┬───────────────┘
       │                                   │
       │ 2. Click "🤖 Translate from VN"   │
       ▼                                   │
┌──────────────────────────────────────────┴──────┐
│  POST /api/admin/translate                       │
│  { entity_type, entity_id, target_locales }      │
│                                                  │
│  ① load VI source row                            │
│  ② compute source_hash = sha256(fields)          │
│  ③ load glossary (longest-first sorted)          │
│  ④ build prompt (system + glossary + JSON i/o)   │
│  ⑤ POST OpenAI gpt-4o-mini (or gpt-4o per kind)  │
│  ⑥ parse JSON response                           │
│  ⑦ UPSERT into faq_translations / *_translations │
│       reviewed_at = NULL                         │
│       ai_generated_at = now                      │
│       ai_model, prompt_version, source_hash      │
│  ⑧ INSERT ai_translation_log row                 │
│  ⑨ return draft IDs + content to UI              │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  Review tab (EN/ZH)                  │
│   - badge: 🤖 AI · Not reviewed      │
│   - if source_hash mismatch:         │
│     ⚠ Source updated — re-translate  │
│   - Operator edits, clicks Approve   │
│   - UPDATE reviewed_at, reviewed_by  │
└──────────────────┬───────────────────┘
                   │
                   ▼
   Landing fetches via existing /api/v1/faqs?lang=en
   Service layer filters: reviewed_at IS NOT NULL
   OR source_locale = requested_locale
```

**Sync vs async**: synchronous request/response for POC (gpt-4o-mini latency ~2-4s,
per-row translate). Add Cloudflare Queues later only when bulk re-translate
hundreds of rows.

---

## 3. Schema — migration 0018 (Phase 1 only)

> **Scope discipline (v4)**: Phase 1 ships ONLY 3 tables:
> `faq_translations`, `glossary`, `ai_translation_log`.
> `service_block_translations` and `testimonial_translations` are designed
> below in §3.4 (Deferred) but NOT created in migration 0018. They land in
> migration 0019 after FAQ workflow is validated end-to-end.

### 3.1 Phase 1 tables — `faq_translations`

```sql
-- 0018_ai_localization.sql
-- Creates: faq_translations, glossary, ai_translation_log.
-- Migrates: existing faqs rows with locale != 'vi' → faq_translations
--           with status='reviewed' (treat as human-authored, already public).

-- ── FAQs ────────────────────────────────────────────────────
-- The existing `faqs` table holds (scope, position, locale, question, answer).
-- New approach: keep `faqs` as the canonical (VI) row only. Each (scope, position)
-- has exactly one row in `faqs` with locale='vi'. EN/ZH live in `faq_translations`.
--
-- Migration step: existing en/zh rows in `faqs` are moved to `faq_translations`
-- with reviewed_at = now (treat them as human-authored, not AI).

CREATE TABLE faq_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faq_id INTEGER NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in faqs
  question TEXT NOT NULL,
  answer TEXT NOT NULL,

  -- Explicit lifecycle state (single source of truth — DON'T infer from reviewed_at + hash).
  --   draft     — AI just generated, awaiting human review
  --   reviewed  — operator approved, served by public API
  --   stale     — VI source changed since translation; needs re-translate or re-review
  --   failed    — translation attempt errored (parse_error / api_error / timeout); kept for retry history
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'stale', 'failed')),

  -- Why this row became stale. NULL unless status='stale'.
  --   source_changed   — VI source row was edited (most common)
  --   prompt_changed   — prompt_version on this row no longer matches current default
  --   model_changed    — bulk re-translate triggered by model upgrade (e.g. gpt-4o-mini → gpt-4o)
  --   manual_mark      — operator explicitly marked stale (e.g. spotted a quality regression)
  stale_reason TEXT CHECK (stale_reason IN (
    'source_changed', 'prompt_changed', 'model_changed', 'manual_mark'
  )),

  -- Provenance / audit
  source_locale TEXT NOT NULL DEFAULT 'vi',
  source_hash TEXT NOT NULL,            -- sha256 of NORMALIZED source fields (see §3.2)
  source_snapshot TEXT,                 -- NULL allowed for historical migrated rows; AI-translated rows MUST set it
  ai_generated_at INTEGER,              -- NULL = human-authored, non-NULL = AI draft
  ai_model TEXT,                        -- 'gpt-4o-mini' | 'gpt-4o'
  prompt_version TEXT,                  -- 'v1' | 'v2-marketing' | ...

  -- Review state
  reviewed_at INTEGER,                  -- NULL until status='reviewed'
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- One translation per (faq_id, locale). If we ever want versioned drafts
  -- (e.g. compare prompt v1 vs v2 side-by-side before approving, or keep the
  -- reviewed row visible while generating a new draft), drop this and replace
  -- with a partial unique index: UNIQUE(faq_id, locale) WHERE status='reviewed'.
  -- For POC, one row wins — re-translate overwrites the existing row.
  -- TODO(phase-7): revisit when implementing version comparison UI.
  UNIQUE (faq_id, locale)
);
CREATE INDEX idx_faq_trans_lookup ON faq_translations(faq_id, locale);
CREATE INDEX idx_faq_trans_status ON faq_translations(status);

-- ── Glossary ────────────────────────────────────────────────
CREATE TABLE glossary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_vi TEXT NOT NULL,
  term_en TEXT NOT NULL,
  term_zh TEXT NOT NULL,

  -- Group for admin UX and (later) for prompt narrowing — only inject
  -- terms relevant to the entity type being translated.
  --   shipping    — routes, carriers, transit times, customs
  --   warehouse   — fulfillment, storage, packing, OMS/WMS
  --   ecommerce   — POD, dropship, marketplaces (TikTok Shop, Etsy, Amazon)
  --   payments    — Pingpong, Payoneer, currency wording, deposits
  --   marketing   — slogans, value propositions, audience-facing phrases
  --   brand       — THG-specific names, product names (THG Fulfill, THG Express, …)
  --   general     — domain-agnostic everyday terms
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'shipping', 'warehouse', 'ecommerce', 'payments', 'marketing', 'brand', 'general'
  )),

  notes TEXT,                           -- "only for warehouse section", "marketing only", …
  priority INTEGER NOT NULL DEFAULT 0,  -- higher = matched first (within same length tier)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_glossary_vi ON glossary(term_vi);
CREATE INDEX idx_glossary_category ON glossary(category);
-- Matching algorithm: sort glossary entries by LENGTH(term_vi) DESC, then priority DESC.
-- Inject in that order so "Kho Trung Quốc" replaces before "Kho".
--
-- POLICY (v4.1, enforced in code):
--   - Exact phrase match (no fuzzy, no stemming, no lemmatization)
--   - Case-SENSITIVE (Vietnamese diacritics carry meaning; "kho" vs "Kho" treated distinct)
--   - No regex (terms are literal strings; users may add punctuation, dashes, etc.)
--   - Whole-phrase substitution (no partial-word matches — "Order hộ" must not match inside "Order hộp")
-- These constraints are deliberate: deterministic injection beats clever matching every time.

-- ── AI translation log (analytics) ──────────────────────────
CREATE TABLE ai_translation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,            -- 'faq' | 'service_block' | 'testimonial' | …
  entity_id INTEGER NOT NULL,
  target_locales TEXT NOT NULL,         -- JSON array: '["en","zh"]'

  -- IDs of translation rows produced/updated by this call. JSON array of integers,
  -- e.g. '[142, 143]' for one call that wrote en + zh rows. Empty array '[]' if
  -- the call failed before any row was written. NOT a real FK (D1 SQLite has no
  -- JSON FK), but the IDs reference {entity_type}_translations.id.
  --
  -- Why on the log (not the translation row): one call → many rows (en + zh),
  -- so a single FK on the translation row pointing back to the log entry is
  -- cleaner read direction, but call-level cost/tokens stay aggregated here.
  target_translation_ids TEXT NOT NULL DEFAULT '[]',

  ai_model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  -- USD cost computed at write time using THEN-current model pricing. Stored
  -- (not recomputed) so dashboards / anomaly detection / quotas don't break
  -- when OpenAI changes their price list later.
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'parse_error', 'api_error', 'timeout')),
  error_message TEXT,

  -- Forensics — raw OpenAI completion, captured regardless of status. Critical
  -- when AI hallucinates a field, drops a key, or wraps JSON in markdown fences.
  -- Without this we cannot prove what the model actually returned.
  raw_response_json TEXT,

  requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,            -- snapshot at translation time
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ai_trans_log_status ON ai_translation_log(status, created_at DESC);
CREATE INDEX idx_ai_trans_log_entity ON ai_translation_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_ai_trans_log_user ON ai_translation_log(requested_by, created_at DESC);
```

### 3.2 Source-hash function (normalized)

Hash NORMALIZED content, not raw. Cosmetic edits (trailing whitespace, CRLF
flips, double-space) must not invalidate approved translations.

```ts
/** Normalize a single field for hashing. Order matters:
 *  1. Convert CRLF / CR → LF
 *  2. Trim leading/trailing whitespace on each LINE (preserve line count)
 *  3. Normalize markdown bullet spacing: "-  item" / "*   item" → "- item"
 *  4. Trim leading/trailing whitespace overall
 *  5. Collapse runs of spaces/tabs (but NOT newlines) to a single space
 *  We intentionally do NOT lowercase — case carries meaning in some locales.
 *  We intentionally do NOT strip emoji or punctuation — they're content. */
function normalizeForHash(s: string): string {
  return s
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))           // trailing whitespace per line
    .map((line) => line.replace(/^(\s*)([-*+])\s+/, "$1$2 "))  // bullet spacing canonical
    .join("\n")
    .trim()
    .replace(/[ \t]+/g, " ");
}

/** sha256 of canonical-ordered, normalized fields, separated by \x1f. */
async function computeSourceHash(fields: Record<string, string>): Promise<string> {
  const sorted = Object.keys(fields).sort();
  const joined = sorted.map((k) => `${k}=${normalizeForHash(fields[k])}`).join("\x1f");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(joined));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

### 3.3 Stale detection (state transition, not read-time computation)

Stale is a STORED status, not an inferred flag. When the VI source row is
edited, we recompute its normalized hash and transition any dependent reviewed
translations to `stale` in the same transaction:

```sql
-- Pseudo: inside the VI-row update handler, after writing the new source:
UPDATE faq_translations
   SET status = 'stale', updated_at = unixepoch()
 WHERE faq_id = :id
   AND status = 'reviewed'
   AND source_hash != :new_hash;
```

This means `SELECT * WHERE status = 'reviewed'` is enough at fetch time — no
hash recompute in the read path.

`draft` rows are not auto-stale-d (they're already pending review; just
re-translate when operator gets to them). `failed` rows are kept until retried.

### 3.4 Deferred to Phase 2 — `service_block_translations`, `testimonial_translations`

> **NOT in migration 0018.** Designed here so the FAQ schema doesn't end up
> inconsistent with future siblings, but creation waits until after FAQ
> workflow is validated end-to-end (see Phase 6 in §8).

Shape mirrors `faq_translations` exactly, with entity-specific localized fields:

```sql
-- 0019_ai_localization_phase2.sql (FUTURE — do not create yet)

CREATE TABLE service_block_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_block_id INTEGER NOT NULL REFERENCES service_blocks(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),
  title TEXT,
  description TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',  -- localized payload (tag, items, features, note, …)

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'stale', 'failed')),
  stale_reason TEXT CHECK (stale_reason IN (
    'source_changed', 'prompt_changed', 'model_changed', 'manual_mark'
  )),
  source_locale TEXT NOT NULL DEFAULT 'vi',
  source_hash TEXT NOT NULL,
  source_snapshot TEXT,
  ai_generated_at INTEGER,
  ai_model TEXT,
  prompt_version TEXT,
  reviewed_at INTEGER,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (service_block_id, locale)
);
CREATE INDEX idx_sb_trans_lookup ON service_block_translations(service_block_id, locale);
CREATE INDEX idx_sb_trans_status ON service_block_translations(status);

CREATE TABLE testimonial_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  testimonial_id INTEGER NOT NULL REFERENCES testimonials(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),
  fields_json TEXT NOT NULL,            -- { quote, role, tag }

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'stale', 'failed')),
  stale_reason TEXT CHECK (stale_reason IN (
    'source_changed', 'prompt_changed', 'model_changed', 'manual_mark'
  )),
  source_locale TEXT NOT NULL DEFAULT 'vi',
  source_hash TEXT NOT NULL,
  source_snapshot TEXT,
  ai_generated_at INTEGER,
  ai_model TEXT,
  prompt_version TEXT,
  reviewed_at INTEGER,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (testimonial_id, locale)
);
CREATE INDEX idx_test_trans_status ON testimonial_translations(status);
```

**Why deferred**: FAQ POC must validate review UX, stale lifecycle, edit
ergonomics, and the centralized state-transition service (§4.6) BEFORE we
freeze the schema for 2 more entity types. If FAQ reveals a missing column
or a wrong column type, fixing 1 table is cheap; fixing 3 is migration pain.

---

## 4. Worker pipeline — `/api/admin/translate`

### 4.1 Endpoint contract

```ts
POST /api/admin/translate
auth: admin/editor session required

body: {
  entity_type: "faq" | "service_block" | "testimonial",
  entity_id: number,
  target_locales: ("en" | "zh")[],
  model?: "gpt-4o-mini" | "gpt-4o",    // optional override; default per entity_type
  prompt_version?: string                 // optional; default = current
}

response 200: {
  drafts: [
    {
      id: 142,                            // translation row ID (already persisted)
      locale: "en",
      fields: { question: "...", answer: "..." },
      source_hash: "abc123...",
      ai_model: "gpt-4o-mini",
      prompt_version: "v1"
    },
    { ... zh ... }
  ],
  tokens_in: 412,
  tokens_out: 318,
  latency_ms: 2143
}

response 400: { error: "Source row not found" | "Empty source content" }
response 429: { error: "Daily token budget exceeded", retry_after: ... }
response 502: { error: "Translation parse error", raw_response: "..." }
```

### 4.2 Server-side flow (per-locale, parse-recoverable, race-safe)

```ts
async function translate(req) {
  // 1. Load VI source row
  const source = await loadSource(entity_type, entity_id);
  if (!source) throw 400;
  if (!isLocale(source.locale, "vi")) throw 400;

  // 2. Compute normalized hash
  const hash = await computeSourceHash(source.fields);

  // 3. DUPLICATE DRAFT PROTECTION (v4.2)
  //    Acquire row-level lock per target locale BEFORE calling OpenAI.
  //    If existing row is status='draft' with same source_hash → reuse
  //    (idempotent — second click just returns the existing draft).
  //    If existing row is in-flight (transient `translating` marker): reject 409.
  const locks = await acquireDraftLocks(entity_type, entity_id, target_locales, hash);
  if (locks.someoneElseInFlight) {
    throw 409 "Translation already in progress for this entity";
  }
  const alreadyDraftedLocales = locks.reusable;  // existing drafts to skip
  const localesToTranslate = target_locales.filter(l => !alreadyDraftedLocales.includes(l));

  // 4. Load glossary, sort longest-first
  const glossary = (await loadGlossary())
    .sort((a, b) => b.term_vi.length - a.term_vi.length || b.priority - a.priority);

  // 5. Build prompt (see §5)
  const messages = buildPrompt({ source, glossary, target_locales: localesToTranslate, prompt_version });

  // 6. Call OpenAI with malformed-JSON recovery (v4.2)
  const t0 = Date.now();
  const { rawResponse, parsed, parseAttempts, tokens_in, tokens_out, apiError } =
    await callOpenAIWithJsonRecovery(model, messages);
  const latency = Date.now() - t0;

  // 7. PER-LOCALE OUTCOME (v4.2)
  //    Each target locale is judged independently. EN can land `draft` even
  //    if ZH parsing failed. Reasons:
  //      - api_error: whole call errored, all target locales → failed stubs
  //      - parsed but missing locale key: that locale → failed; others may succeed
  //      - parsed but missing required field in locale: that locale → failed
  //      - parsed OK + structural validation OK: that locale → draft
  const perLocaleOutcome: Record<Locale, "draft" | "failed"> = {};
  const createdTranslationIds: number[] = [];

  for (const locale of localesToTranslate) {
    let outcome: "draft" | "failed" = "failed";
    let fields: Record<string, string> | null = null;

    if (apiError) {
      outcome = "failed";
    } else if (parsed?.[locale] && hasAllExpectedFields(parsed[locale], source.fields)
               && passesStructuralChecks(parsed[locale], source.fields)) {
      outcome = "draft";
      fields = parsed[locale];
    }

    const row = await upsertTranslation({
      entity_type, entity_id, locale,
      fields: fields ?? null,
      status: outcome,
      stale_reason: null,
      source_hash: hash,
      source_snapshot: source.serialized,
      ai_generated_at: Math.floor(Date.now() / 1000),
      ai_model: model,
      prompt_version,
      reviewed_at: null,
      reviewed_by: null,
    });
    createdTranslationIds.push(row.id);
    perLocaleOutcome[locale] = outcome;
  }

  // 8. Log — single row, captures call-level metrics + per-locale outcome
  await logTranslation({
    entity_type, entity_id,
    target_locales: JSON.stringify(localesToTranslate),
    target_translation_ids: JSON.stringify(createdTranslationIds),
    ai_model: model, prompt_version,
    tokens_in, tokens_out,
    estimated_cost_usd: computeCostUsd(model, tokens_in, tokens_out),
    latency_ms: latency,
    status: apiError ? "api_error"
            : parseAttempts > 1 && parsed ? "success"   // recovered after retry
            : !parsed ? "parse_error"
            : "success",
    error_message: apiError?.message ?? null,
    raw_response_json: rawResponse,
    requested_by: session.user.id,
    source_hash: hash,
  });

  return {
    drafts: createdTranslationIds,
    per_locale_outcome: perLocaleOutcome,
    reused_existing: alreadyDraftedLocales,
    tokens_in, tokens_out, latency_ms: latency
  };
}
```

**Critical invariants**:
1. Drafts persisted INSIDE the request handler (v3 invariant — still holds).
2. Each locale's outcome is INDEPENDENT (v4.2). UI shows granular state.
3. Duplicate calls are SAFE — second click returns existing drafts (v4.2).
4. Raw OpenAI response saved EVEN on parse_error (v3 invariant — still holds).

### 4.3 Malformed JSON recovery

```ts
async function callOpenAIWithJsonRecovery(model, messages) {
  // First attempt
  let res = await callOpenAI(model, messages);
  let parsed = tryParseJson(res.content);
  if (parsed) return { rawResponse: res.content, parsed, parseAttempts: 1,
                       tokens_in: res.tokens_in, tokens_out: res.tokens_out };

  // Second attempt with stricter prompt — OpenAI's most common failure is
  // wrapping JSON in ```json fences or adding "Here is the translation:" prose.
  // The retry message explicitly forbids both.
  const retryMessages = [
    ...messages,
    { role: "assistant", content: res.content },
    { role: "user", content:
      "Your previous response was not valid JSON. Reply with the JSON object ONLY. " +
      "Do not wrap in markdown code fences. Do not add any prose before or after. " +
      "Start your response with `{` and end with `}`." },
  ];
  let res2 = await callOpenAI(model, retryMessages);
  parsed = tryParseJson(res2.content);
  return {
    rawResponse: res.content + "\n---RETRY---\n" + res2.content,  // preserve both for forensics
    parsed,  // may still be null after retry
    parseAttempts: 2,
    tokens_in: res.tokens_in + res2.tokens_in,
    tokens_out: res.tokens_out + res2.tokens_out,
  };
}

function tryParseJson(s: string): Record<string, unknown> | null {
  // Strip common wrappers: ```json ... ```, ``` ... ```, leading/trailing prose
  const stripped = s
    .replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1")  // grab outermost {...}
    .trim();
  try { return JSON.parse(stripped); } catch { return null; }
}
```

**Retry budget**: max 1 retry per call. If both attempts fail → `parse_error`
log entry, all target locales upsert as `failed` rows. Operator sees ❌ + can
click "Retry" (which is just another `/translate` call → `operator_retried`
transition resets the matrix).

### 4.4 Structural validation (post-parse)

Before accepting a translated field as `draft`, run cheap structural checks:

```ts
function passesStructuralChecks(translated: Record<string, string>,
                                 source: Record<string, string>): boolean {
  for (const key of Object.keys(source)) {
    const src = source[key], dst = translated[key];
    if (typeof dst !== "string") return false;
    if (dst.length === 0 && src.length > 0) return false;

    // Bullet count must match (don't let AI drop bullets)
    const srcBullets = (src.match(/^[ \t]*[-*+]\s/gm) ?? []).length;
    const dstBullets = (dst.match(/^[ \t]*[-*+]\s/gm) ?? []).length;
    if (srcBullets !== dstBullets) return false;

    // Heading count must match (`#`, `##`, `###`)
    const srcHeadings = (src.match(/^#{1,6}\s/gm) ?? []).length;
    const dstHeadings = (dst.match(/^#{1,6}\s/gm) ?? []).length;
    if (srcHeadings !== dstHeadings) return false;

    // Newline count rough match (within ±20% — translations are often slightly shorter/longer per line)
    const srcLines = src.split("\n").length, dstLines = dst.split("\n").length;
    if (Math.abs(srcLines - dstLines) / Math.max(srcLines, 1) > 0.2) return false;
  }
  return true;
}
```

Not too strict — translations differ in length and word count by design. We
only catch OBVIOUS corruption (bullets removed, headings dropped, whole
paragraphs missing). False-negative is fine; false-positive (rejecting a good
translation) is the bigger cost, so thresholds are loose.

### 4.5 Glossary matching (longest-first)

```ts
function applyGlossary(text: string, glossary: GlossaryRow[]): string {
  // glossary already sorted by term_vi.length DESC
  let out = text;
  const placeholders: { token: string; en: string; zh: string }[] = [];
  glossary.forEach((g, i) => {
    if (out.includes(g.term_vi)) {
      const token = `__GLOSS_${i}__`;
      out = out.split(g.term_vi).join(token);
      placeholders.push({ token, en: g.term_en, zh: g.term_zh });
    }
  });
  // Pass `out` + placeholders to prompt — AI is instructed to keep tokens as-is,
  // then we replace them with locale-correct terms post-response.
  return { masked: out, placeholders };
}
```

Alternative (simpler, lower fidelity): just inject "translate X→Y" in the prompt
and let the model handle it. We start with that for POC; upgrade to masking if
quality is inconsistent.

### 4.6 Centralized state transitions (single mutation surface)

`status` is the highest-leverage column in this schema. If admin UI, public
API service, translate worker, and source-edit handlers each mutate it
directly, drift WILL happen within months — at which point you cannot trust
that `status='reviewed'` actually means "approved by a human".

**Rule**: only ONE function writes `status`. Everywhere else calls it.

#### Transition matrix (canonical — code mirrors this table)

|              | `ai_completed` | `ai_failed` | `operator_approved` | `operator_edited` | `source_changed` | `prompt_changed` | `model_changed` | `manual_mark_stale` | `operator_retried` |
|--------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **draft**    | draft | failed | reviewed | draft | stale | stale | stale | stale | draft |
| **reviewed** | draft | failed | reviewed¹ | draft | stale | stale | stale | stale | draft |
| **stale**    | draft | failed | reviewed² | draft | stale | stale | stale | stale | draft |
| **failed**   | draft | failed | ❌ reject³ | ❌ reject | ❌ reject | ❌ reject | ❌ reject | ❌ reject | draft |

- ¹ `reviewed → reviewed` on `operator_approved` is idempotent (no-op, but logs the click).
- ² `stale → reviewed` means operator confirmed the stale copy is still correct without re-translating.
- ³ A failed row cannot be approved. Operator must retry first (`operator_retried`) → moves to `draft`.

When `status` transitions to `stale`, `stale_reason` MUST be set to the event:
- `source_changed` → `stale_reason='source_changed'`
- `prompt_changed` → `stale_reason='prompt_changed'`
- `model_changed` → `stale_reason='model_changed'`
- `manual_mark_stale` → `stale_reason='manual_mark'`

When `status` transitions OUT of `stale` (`stale → draft` / `reviewed`),
`stale_reason` MUST be cleared to NULL.

```ts
// src/features/translations/translations.transitions.ts

type Status = "draft" | "reviewed" | "stale" | "failed";
type StaleReason = "source_changed" | "prompt_changed" | "model_changed" | "manual_mark";

type Event =
  | { kind: "ai_completed" }                        // worker finished → draft
  | { kind: "ai_failed", error: string }            // worker errored → failed
  | { kind: "operator_approved", userId: number }   // human approval → reviewed
  | { kind: "operator_edited", userId: number }     // human edit → draft (demote)
  | { kind: "source_changed" }                      // VI source row updated → stale
  | { kind: "prompt_changed" }                      // prompt version bumped → stale
  | { kind: "model_changed" }                       // model upgrade → stale
  | { kind: "manual_mark_stale", userId: number }   // operator marks bad → stale
  | { kind: "operator_retried", userId: number };   // re-translate after failure → draft

// Canonical matrix — MUST mirror the table in §4.6 above. Null means "reject".
const TRANSITIONS: Record<Status, Partial<Record<Event["kind"], Status | null>>> = {
  draft:    { ai_completed: "draft", ai_failed: "failed", operator_approved: "reviewed",
              operator_edited: "draft", source_changed: "stale", prompt_changed: "stale",
              model_changed: "stale", manual_mark_stale: "stale", operator_retried: "draft" },
  reviewed: { ai_completed: "draft", ai_failed: "failed", operator_approved: "reviewed",
              operator_edited: "draft", source_changed: "stale", prompt_changed: "stale",
              model_changed: "stale", manual_mark_stale: "stale", operator_retried: "draft" },
  stale:    { ai_completed: "draft", ai_failed: "failed", operator_approved: "reviewed",
              operator_edited: "draft", source_changed: "stale", prompt_changed: "stale",
              model_changed: "stale", manual_mark_stale: "stale", operator_retried: "draft" },
  failed:   { ai_completed: "draft", ai_failed: "failed", operator_retried: "draft",
              operator_approved: null, operator_edited: null, source_changed: null,
              prompt_changed: null, model_changed: null, manual_mark_stale: null },
};

// ── PURE: validation only (unit-testable, no I/O) ──
export function validateTransition(from: Status, event: Event): Status | { error: string } {
  const next = TRANSITIONS[from]?.[event.kind];
  if (next === null) return { error: `Cannot ${event.kind} from status='${from}'` };
  if (next === undefined) return { error: `Unknown event '${event.kind}' for status='${from}'` };
  return next;
}

// ── PURE: derive side-effect fields for the row update ──
export function computeSideEffects(
  from: Status, to: Status, event: Event,
): Partial<TranslationRow> {
  const patch: Partial<TranslationRow> = { status: to, updated_at: nowSec() };
  if (to === "stale") {
    patch.stale_reason = event.kind === "source_changed"   ? "source_changed"
                       : event.kind === "prompt_changed"   ? "prompt_changed"
                       : event.kind === "model_changed"    ? "model_changed"
                       : event.kind === "manual_mark_stale" ? "manual_mark"
                       : null;
  } else if (from === "stale" && to !== "stale") {
    patch.stale_reason = null;
  }
  if (to === "reviewed" && event.kind === "operator_approved") {
    patch.reviewed_at = nowSec();
    patch.reviewed_by = event.userId;
  } else if (from === "reviewed" && to !== "reviewed") {
    patch.reviewed_at = null;
    patch.reviewed_by = null;
  }
  return patch;
}

// ── IMPURE: I/O wrapper. Composes pure functions + DB + audit. ──
export async function applyTransition(
  table: "faq_translations" | "service_block_translations" | "testimonial_translations",
  id: number,
  event: Event,
): Promise<{ from: Status; to: Status }> {
  return withTransaction(async (tx) => {
    const current = await tx.selectOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!current) throw new NotFound();

    const result = validateTransition(current.status, event);
    if (typeof result === "object") throw new InvalidTransition(result.error);

    const patch = computeSideEffects(current.status, result, event);
    await tx.update(table, id, patch);

    await tx.insert("audit_log", {
      actor_id: "userId" in event ? event.userId : null,
      action: `translation_transition_${event.kind}`,
      entity: table,
      entity_id: String(id),
      before_json: JSON.stringify({ status: current.status, stale_reason: current.stale_reason }),
      after_json: JSON.stringify(patch),
    });

    return { from: current.status, to: result };
  });
}

// ── Public alias (keeps existing callsites in spec happy) ──
export const transitionTranslationStatus = applyTransition;
```

**Why split**: `validateTransition` and `computeSideEffects` are deterministic
table lookups. Unit tests cover the FULL matrix (4 statuses × 9 events = 36
cases) in milliseconds, no DB mock. `applyTransition` only orchestrates I/O.
When we add queue/retry in Phase 7, we can wrap `applyTransition` with retry
logic without touching validation.

**Enforcement**: code review rule. Any direct `UPDATE … SET status =` outside
this module is a regression. Add a grep check in CI later (Phase 7):
`grep -r "SET status" src/ | grep -v translations.transitions.ts` should be empty.

**Audit**: every transition writes one `audit_log` row with `before`/`after`
status + event kind + actor user_id.

---

## 5. Prompt template

### 5.1 Versioning

Every prompt has a `prompt_version` string. Current: `v1`. When prompt changes
(adding examples, changing tone), bump to `v2`. Old translations keep their
original version → re-translate decision can filter by version.

### 5.2 v1 prompt (current)

```
SYSTEM:
You localize Vietnamese marketing copy for THG Fulfill — a cross-border
fulfillment service connecting Vietnam, China, and the USA. Goal: produce
naturally persuasive English and Mandarin copy. This is LOCALIZATION, not
literal translation: preserve sales tone, urgency, and clarity.

GLOSSARY — translate these terms exactly as specified:
{{glossary_lines}}
  e.g.
  "Kho Trung Quốc" → en: "China warehouse" | zh: "中国仓库"
  "Order hộ" → en: "proxy purchasing" | zh: "代购"

RULES:
- Output STRICT JSON. No prose, no markdown fences.
- Schema: { "en": { ...same field keys as input... }, "zh": { ... } }
- Preserve all emoji, bullet markers (✅ ⛔ 📌), and line-break structure.
- Newlines stay as \n.
- DO NOT add or remove any field keys.
- For numeric values, prices, addresses, URLs: keep verbatim.
- For currency: if VI says "$" assume USD, keep as "$" in en, use "美元" in zh
  when used in prose, "$" when in tables.

USER:
Translate this {{entity_type}} row to {{target_locales.join(', ')}}:

{
  "vi": {{json source.fields}}
}
```

### 5.3 Model selection per entity type

| Entity type | Default model | Reason |
|-------------|---------------|--------|
| `faq` | `gpt-4o-mini` | High volume, conversational tone, mini handles it |
| `service_block` | `gpt-4o-mini` | Short cards, structured |
| `testimonial` | `gpt-4o-mini` | First-person, mini handles tone |
| `homepage_block` (hero) | `gpt-4o` | High-visibility, persuasive impact matters |
| `seo_meta` | `gpt-4o` | SEO title/desc require careful keyword placement |
| `ad_copy` | `gpt-4o` | Conversion-critical |

Operator can override via the `model` request parameter.

---

## 6. Admin UI

### 6.1 POC scope: FAQ single-row translate

**Existing**: `src/routes/admin/content/faqs/index.tsx` shows scope tabs + locale
tabs. Each row in the table = one (scope, position, locale).

**New affordances**:

```
┌────────────────────────────────────────────────────────────────┐
│  Scope: [Home] [Order] [Express] …                             │
│  Locale: [VI] [EN] [ZH]                                        │
├────────────────────────────────────────────────────────────────┤
│  When on VI tab:                                               │
│  Pos │ Question                       │ EN │ ZH │ Actions      │
│   1  │ Tôi cần làm gì để…            │ ✓  │ ✓  │ [Edit] [🤖]  │
│   2  │ Thời gian từ lúc đặt…         │ ⚠  │ ✓  │ [Edit] [🤖]  │
│   3  │ (new VI row)                   │ —  │ —  │ [Edit] [🤖]  │
│                                                                │
│  Legend: ✓ reviewed, ⚠ stale (source changed), — no translation│
│                                                                │
│  [🤖] button on each VI row = "Suggest EN+ZH for this row"     │
└────────────────────────────────────────────────────────────────┘
```

**Suggest flow** (single row):
1. Operator clicks `[🤖]` on VI row #1.
2. UI calls `POST /api/admin/translate` (synchronous, ~2-4s, show spinner).
3. Response = 2 draft IDs (EN, ZH) — already persisted.
4. UI opens side-by-side modal:
   ```
   ┌────────────────────────────────────────────────────────────┐
   │ Translate FAQ #1                                           │
   ├────────────────────────────────────────────────────────────┤
   │ 🇻🇳 VI (source)         │ 🇺🇸 EN (AI draft)  │ 🇨🇳 ZH      │
   │ Tôi cần làm gì để…    │ How do I start…    │ 如何开始…    │
   │ [readonly]            │ [editable]         │ [editable]   │
   │ Rất đơn giản! Copy…  │ Simple! Copy…      │ 很简单！…    │
   │ [readonly]            │ [editable]         │ [editable]   │
   │                       │                    │              │
   │                       │ [Approve EN]       │ [Approve ZH] │
   │                       │ [Re-generate]      │ [Re-generate]│
   └────────────────────────────────────────────────────────────┘
   ```
5. Operator edits if needed, clicks `Approve EN` → UPDATE `reviewed_at`, `reviewed_by`.
6. Modal can be closed at any time — drafts persisted server-side, badge shows
   `🤖 AI · Not reviewed` on EN/ZH tabs until approved.

**Stale handling**: when VI source row is saved, the VI-update handler runs the
`UPDATE … SET status='stale'` query from §3.3 in the same transaction. EN/ZH
tabs show the ⚠ badge from the stored status — no recompute at read time. Click
"Re-translate" calls `/translate` again, which UPSERTs the row back to
`status='draft'` with the fresh `source_hash` + `source_snapshot`.

**Immutable-ish approve flow** (§v3 invariant):

When an operator edits an already-approved translation (`status='reviewed'`):
- Save action MUST demote `status` back to `draft` (or `stale` if VI source has
  changed in the meantime).
- `reviewed_at` cleared, `reviewed_by` cleared, `updated_at` bumped.
- Audit-log entry captures the before/after diff via the existing `audit_log`
  table — so we can answer "who changed this previously-approved sales claim,
  and what was it before".
- Operator must click "Approve" again to re-publish.

Rationale: silent overwrite of approved copy breaks the accountability chain
(legal/marketing review of EN/ZH sales claims). Forcing re-approval makes every
change a deliberate act.

The only path that keeps `status='reviewed'` across edits is the dedicated
"Quick-fix typo" mode (out of scope for POC, future enhancement) — and even
that would log a `quick_fix_reviewed` audit entry rather than skipping review
entirely.

### 6.2 Glossary admin (`/admin/content/glossary`)

Simple CRUD table:
```
| Category    | Term (VI)         | EN                | ZH         | Pri | Notes        |
| warehouse   | Kho Trung Quốc    | China warehouse   | 中国仓库   | 10  |              |
| ecommerce   | Order hộ          | proxy purchasing  | 代购       |  5  |              |
| ecommerce   | TMĐT              | e-commerce        | 电商       |  0  |              |
| [+ Add term]                                                                          |
```

**Duplicate-warning UX (v4.2, soft governance — never auto-block):**
- On `Add` / `Edit`, before save: query for existing terms whose `term_vi`
  is a substring of the new one (or vice versa). Show inline warning:
  > ⚠ "Kho TQ" is a substring of existing "Kho Trung Quốc" — adding may
  > cause inconsistent matching. Same concept? Update the existing entry instead.
- Warn (don't block) on conflicting `term_en` / `term_zh` for entries in
  the SAME `category` (e.g. two `warehouse` rows mapping different VI terms
  to "China warehouse").
- Filter UI by `category` — operator can scan within a category to spot
  near-duplicates before adding.

Seed list (initial ~25 terms) — see §13.3 for curation rules. NOT
auto-extracted from `i18n.tsx`; only operationally-stable high-signal phrases.

### 6.3 Out of scope for POC

- Bulk translate (all VI rows in a scope at once)
- Diff view across prompt versions
- Cost dashboard (read straight from `ai_translation_log` for now)
- Reviewer assignment workflows

---

## 7. Public API filter & locale fallback policy

### 7.1 Filter

`/api/v1/faqs?lang=en` — current behavior: returns all `faqs` rows where locale='en'.

**v3 behavior**:
```sql
SELECT t.question, t.answer
FROM faqs f
LEFT JOIN faq_translations t ON t.faq_id = f.id AND t.locale = :lang
WHERE f.scope = :scope
  AND (
    :lang = 'vi'                              -- VI is source, always serve
    OR (t.id IS NOT NULL AND t.status = 'reviewed')  -- EN/ZH must be reviewed
  )
ORDER BY f.position
```

**Effect**: only `status='reviewed'` rows reach landing. `draft`, `stale`, and
`failed` rows are invisible to the public API.

### 7.2 Locale fallback policy (explicit, mandatory)

**Policy: NO cross-locale fallback inside the public API.**

- Request `lang=zh` finds no reviewed `zh` row → API returns no row for that key.
- Landing's existing `i18n.tsx` static dictionary then supplies the default
  string for that locale (see [THG_landingpage/src/lib/i18n.tsx:1487-1497](../../THG_landingpage/src/lib/i18n.tsx)).
- The static dictionary already has en/vi/zh for every key shipped with the
  build, so there is always SOMETHING to render.

**Why not chain `zh → en → vi` server-side?**
- SEO penalty: a `lang="zh"` page serving English content gets demoted in
  Baidu/Bing-zh + creates duplicate-content signals with the EN page.
- Mixed-language pages confuse users worse than slightly-stale localized copy.
- The static i18n.tsx default IS the safety net — no need to invent a second one.

**Operator implication**: if you want a key live in ZH, you must approve it in
ZH. Until then, users see the bundled i18n.tsx default. This is intentional —
it forces deliberate localization rather than silent English bleed-through.

### 7.3 Apply to all migrated endpoints

- `/api/v1/faqs`
- `/api/v1/service-blocks`
- `/api/v1/testimonials`
- `/api/v1/services` (if migrated later)
- `/api/v1/homepage` (if hero migrated later)

---

## 8. Rollout phases

### Phase 1 — FAQ schema + glossary (0.5d)
- Migration 0018: **only** `faq_translations`, `glossary`, `ai_translation_log`
- Data migration (v4.2 semantics — preserve human-authored distinction):
  - Move existing `faqs` EN/ZH rows → `faq_translations`
  - `status = 'reviewed'`, `reviewed_at = NOW()` — already public
  - `ai_generated_at = NULL` — human-authored, NOT AI
  - `source_snapshot = NULL` — no AI source to reference
  - `reviewed_by = NULL` — historical, no auditor on record
  - `ai_model = NULL`, `prompt_version = NULL`
  - This way `WHERE ai_generated_at IS NOT NULL` cleanly isolates AI-translated
    rows for analytics; historical human rows stay invisible to AI dashboards.
- Admin glossary CRUD page (with duplicate-warning UX — see §6.2)
- Seed 25 initial glossary terms (high-signal only — operational vocabulary +
  brand-critical phrases; NOT marketing copy or CTAs — see §13.3)
- Pure `validateTransition()` + `computeSideEffects()` unit-tested (4×9 matrix)
- Impure `applyTransition()` wired into glossary CRUD (no transitions in Phase 1
  other than `manual_mark_stale` — kept in to validate the plumbing)

### Phase 2 — Worker + prompt (1d)
- `/api/admin/translate` endpoint
- Normalized source hash computation (per §3.2)
- Glossary loader (sorted longest-first)
- OpenAI integration (reuse `copilot.openai.ts` patterns)
- v1 prompt template
- Token budget enforcement (reuse `ai_usage` table)
- `ai_translation_log` writes (with `raw_response_json` + `estimated_cost_usd`)
- All status changes go through `transitionTranslationStatus()`

### Phase 3 — FAQ POC UI (1.5d)
- `[🤖]` button on VI rows
- Side-by-side review modal showing `source_snapshot` ↔ EN draft ↔ ZH draft
- Approve / Re-generate / Edit
- Stale badge on EN/ZH tabs (from stored `status`, no read-time hash recompute)
- Edit-after-approve demotes to `draft` via transition service

### Phase 4 — Public API gating (0.25d)
- Filter `status='reviewed'` in `/api/v1/faqs`
- NO cross-locale fallback (per §7.2)
- Update Zod schema in landing if response shape changes
- Manual smoke test: VI loads, EN/ZH fall back to static i18n when no reviewed row

### Phase 5 — End-to-end validation + freeze schema (0.5d)
- Use existing thg-order FAQ (7 rows × 3 locales already seeded)
- Delete EN/ZH rows from `faq_translations`
- Re-translate via UI, review, approve
- Verify landing renders the AI-generated copy
- **Workflow checkpoint**: confirm review UX / stale lifecycle / edit ergonomics
  feel right. Capture any missing columns or events. ONLY after this passes do
  we generalize.

### Phase 6 — Generalize to service_blocks + testimonials (1.5d, future)
- Migration 0019: `service_block_translations` + `testimonial_translations` (per §3.4)
- Reuse worker + UI patterns; per-type prompt variants (testimonials = first-person voice)
- Apply lessons from Phase 5 (schema tweaks, missing columns, transition events)

### Phase 7 — Bulk + queue (future, not POC)
- "Translate all unreviewed VI rows in this scope" button
- Cloudflare Queues for fan-out
- Progress UI

**POC total (Phase 1-5): ~3.75 days.** Schema for siblings frozen only after Phase 5 passes.

---

## 9. Cost estimate

| Item | Volume | Cost |
|------|--------|------|
| gpt-4o-mini, 1 FAQ translate | ~500 in + 400 out tokens | $0.0003 |
| 1000 translates/month | mixed | ~$0.30 |
| gpt-4o for hero | ~300 in + 250 out | $0.003 |
| 100 hero translates/month | | ~$0.30 |
| **Realistic monthly budget** | | **<$5** |

Daily per-user cap: 500K tokens (~1000 calls). Enforced via existing `ai_usage` table.

Per-call cost computed at write time using a small pricing table in code:

```ts
const MODEL_PRICING: Record<string, { in_per_mtok: number; out_per_mtok: number }> = {
  "gpt-4o-mini": { in_per_mtok: 0.15, out_per_mtok: 0.60 },
  "gpt-4o":      { in_per_mtok: 2.50, out_per_mtok: 10.00 },
};
// Update this table when OpenAI prices change. Historical
// `ai_translation_log.estimated_cost_usd` values are NOT recalculated — they
// freeze the cost as it was at call time, which is what dashboards want.
```

---

## 10. Future work

- **Translation memory (TM)**: cache (source_hash → translation) lookups. When the
  same VI sentence appears in two places, reuse. Adds value at >1000 rows.
- **Bulk re-translate when prompt_version changes**: queue worker, e.g. `prompt_version=v1 → v2-marketing` upgrades all FAQ EN/ZH atomically.
- **A/B prompt comparison**: store two drafts for the same source with different
  prompt_versions, let operator pick.
- **Asian language expansion**: jp/kr/th — schema already supports it (CHECK
  constraint on locale column to update + glossary columns to add).
- **Fine-tuning on approved translations**: once we have 500+ reviewed pairs,
  fine-tune gpt-4o-mini on THG's voice → cheaper per-call + better baseline.

---

## 11. Operational safety & failure modes (v4.2)

These are NOT design decisions — they're real-world failure modes that the
implementation must handle gracefully. Locked here so the POC code matches
the v4.2 spec exactly.

### 11.1 Race: two admins translate simultaneously

**Scenario**: Admin A clicks `🤖 Translate` on FAQ #1 at 10:00:00.
Admin B clicks `🤖 Translate` on the same FAQ at 10:00:02. OpenAI call
takes ~3s. Without protection: 2 calls fire, 2 sets of drafts get written,
last-write-wins clobbers the other.

**Fix** (per §4.2 step 3): `acquireDraftLocks` in a transaction:
- If existing row has `status='draft'` AND same `source_hash` → reuse (no new OpenAI call). Idempotent re-click.
- If existing row has a transient `translating` flag (set in same transaction, TTL 30s) → return 409 "already in progress".
- Otherwise → proceed and set the flag.

Implementation can use a simple `idempotency_key` column on a short-lived
`translation_in_flight` table, or a Cloudflare Durable Object lock. For POC
we use a column flag `in_flight_until INTEGER` on `faq_translations` itself.

### 11.2 Malformed JSON from OpenAI

Covered in §4.3. Common patterns we recover from:
- ` ```json {…} ``` ` markdown fences
- Prose preamble: "Here is the translation: {…}"
- Trailing prose: "{…} Let me know if you need anything else."
- Extra commas (trailing commas in arrays/objects)

After 1 retry with stricter prompt, give up → `parse_error` log + all target
locales upsert as `failed` rows. Raw responses (both attempts) preserved in
`raw_response_json` joined by `---RETRY---` marker.

### 11.3 Partial translation success (per-locale outcomes)

Covered in §4.2 step 7. EN can succeed as `draft` even if ZH fails. UI shows:

```
EN: ✅ Draft ready — review
ZH: ❌ Failed — retry?
```

A single log row records the call (per-locale outcomes in
`target_translation_ids` — UI reads the `status` of each linked row to render
the chips). One `/translate` invocation = one log row.

### 11.4 HTML/markdown structure corruption

Covered in §4.4. Loose structural validation:
- Bullet count match (`-`, `*`, `+`)
- Heading count match (`#`-prefixed)
- Newline count within ±20%

Translations that fail this check land as `failed`, NOT `draft` — operator
re-translates rather than approving a broken translation that the renderer
might choke on later.

### 11.5 Prompt drift over time

`prompt_version` on every row (§3.1) + every log entry (§3.1). Bulk
re-translate when prompt version bumps is a Phase 7 feature, but the data
needed to drive it is captured from day 1.

Future: `translation_style_version` may be added if we want to support
formal / SEO / conversational style profiles. Reserved namespace, not
implemented in POC.

### 11.6 Glossary pollution over time

Covered in §6.2 (admin UI duplicate-warning). The admin glossary page MUST:
- Warn (not block) when adding a `term_vi` that's a substring of an existing
  term (e.g. "Kho TQ" added when "Kho Trung Quốc" exists).
- Warn on conflicting `term_en` / `term_zh` for similar `term_vi` entries.
- Display category facets so duplicates within the same category surface.

### 11.7 Infinite stale cascade

**Rule (v4.2)**: ONLY `source_changed` auto-fires. All other stale-triggering
events (`prompt_changed`, `model_changed`, `manual_mark_stale`) require an
operator action or a deliberate Phase 7 bulk job.

Concretely:
- VI source row save handler → automatic `source_changed` event on dependent rows.
- Prompt version bump in code → operator MUST click "Mark stale for re-translate" on a per-scope basis.
- Model upgrade → same — operator triggers.

This prevents a cascade where prompt update → mass-stale → mass-retranslate →
unexpected stale on EN due to glossary update → loop.

### 11.8 Approval authority

`reviewed_by` is captured (§3.1). RBAC enforcement (only `admin` role can
approve, or only `editor+` etc.) is NOT in POC scope — current sessions are
admin/editor/viewer (§0001 schema). Phase 7 can tighten if needed; the data
is ready.

### 11.9 Analytics pollution by historical rows

Covered in Phase 1 data migration semantics (§8.1). Historical
human-authored rows have `ai_generated_at = NULL`. Dashboards filter
`WHERE ai_generated_at IS NOT NULL` to see only AI-generated work.

### 11.10 Scope creep during success

**Biggest remaining risk.** Once FAQ POC works, the temptation to immediately
add: blog translation, AI rewrite, auto-SEO, bulk 500-row retranslate, jp/kr
expansion, etc.

**Lock (v4.2)**: After Phase 5 E2E validation passes, a MINIMUM 2-week
production observation window before Phase 6 starts. During observation:
- Track which `stale_reason` events fire most (drives prompt iteration priority)
- Track parse_error rate (drives JSON-recovery prompt tuning)
- Track operator edit-after-approve frequency (drives prompt quality measure)
- Track avg latency, cost per call

ONLY after observation data is in does Phase 6 (service_blocks + testimonials)
start. No exceptions for "but it's just a small addition".

## 12. Anti-patterns to avoid (lessons baked in)

- ❌ **Do NOT** runtime-translate on landing request. Pre-store only.
- ❌ **Do NOT** auto-publish AI drafts. Always `reviewed_at = NULL` initially.
- ❌ **Do NOT** add translation metadata columns to base content tables. Use the
  separate `*_translations` tables.
- ❌ **Do NOT** overwrite reviewed translations on bulk re-translate without
  source_hash check + operator confirmation.
- ❌ **Do NOT** translate UI labels (nav, buttons, microcopy). Those stay in
  `i18n.tsx`. Only marketing/sales copy goes through this pipeline.
- ❌ **Do NOT** mix translation logs into the generic `audit_log`. Use the
  dedicated `ai_translation_log` table.
- ❌ **Do NOT** rely on naive substring glossary replace. Always longest-first
  sorting (or masking with placeholders).
- ❌ **Do NOT** hash raw source string. Always normalize (CRLF→LF, trim,
  collapsed spaces) — cosmetic edits must not invalidate approved translations.
- ❌ **Do NOT** infer translation state from `reviewed_at` + hash mismatch at
  read time. Use the explicit `status` enum. State transitions happen on write.
- ❌ **Do NOT** drop the raw OpenAI response. `raw_response_json` on every
  `ai_translation_log` row, even on success — debugging hallucinations later
  requires it.
- ❌ **Do NOT** ship without `source_snapshot`. Reviewer must see the exact VI
  text the AI translated from; a hash alone is not human-readable.
- ❌ **Do NOT** chain locales server-side (`zh → en → vi`). Public API returns
  nothing for unreviewed locales; landing's static i18n dictionary is the
  safety net.
- ❌ **Do NOT** silently overwrite an approved translation. Edit demotes to
  `draft` and requires re-approval.
- ❌ **Do NOT** create `service_block_translations` / `testimonial_translations`
  in migration 0018. Validate FAQ workflow first; siblings ship in 0019.
- ❌ **Do NOT** write `status` directly anywhere outside
  `transitionTranslationStatus()`. Single mutation surface is enforced.
- ❌ **Do NOT** recompute cost from `tokens_in`/`tokens_out` at dashboard
  time. Store `estimated_cost_usd` at write time — model pricing changes.
- ❌ **Do NOT** skip markdown-aware normalization in the hash. Bullet
  spacing (`-  item` vs `- item`) is cosmetic, not content.
- ❌ **Do NOT** add fuzzy / case-insensitive / regex glossary matching.
  Policy is exact phrase, case-sensitive, no regex. Deterministic > clever.
- ❌ **Do NOT** transition to `stale` without setting `stale_reason`. The
  reason drives operator UX ("source updated, re-translate" vs "model
  upgraded, re-review may suffice").
- ❌ **Do NOT** approve a `failed` row directly. The matrix rejects it —
  operator must `retry` (which transitions failed → draft) first.
- ❌ **Do NOT** treat a `/translate` call as atomic. Per-locale outcomes are
  independent (EN can succeed while ZH fails). UI shows granular state.
- ❌ **Do NOT** give up on first JSON parse failure. 1 retry with stricter
  prompt is mandatory. Both raw responses go into `raw_response_json`.
- ❌ **Do NOT** auto-extract glossary terms from `i18n.tsx`. Hand-curate from
  the 3 sources in §13.1. Glossary is small + stable, not exhaustive.
- ❌ **Do NOT** auto-trigger stale on `prompt_changed` / `model_changed` /
  `glossary_changed`. Only `source_changed` auto-fires. Everything else is
  operator-initiated to prevent cascade loops.
- ❌ **Do NOT** start Phase 6 until 2 weeks of Phase 5 production observation
  data is collected. Scope creep during success is the biggest remaining risk.

---

## 13. Glossary seeding rules + initial seed (v4.2)

### 13.1 Seeding philosophy

Glossary should be **small + stable + high-signal**. Do NOT auto-extract from
`i18n.tsx` — that would pollute with generic sentences, CTA copy, and random
marketing lines. Instead, hand-curate from these 3 sources only:

1. **Repeated domain vocabulary** — terms that appear in 3+ pages and need
   consistent translation. `Kho Trung Quốc`, `TMĐT`, `Order hộ`, `tracking`.
2. **Brand-critical phrases** — names that must NEVER be mistranslated.
   `THG Fulfill`, `THG Express`, `THG Warehouse`, `THG Dropship`.
3. **Operational terminology** — shipping/carrier-specific terms with
   industry-standard translations. `Hàng lô`, `Epacket`, `vùng sâu`, `last-mile`.

### 13.2 What NOT to seed

- ❌ Generic sentences ("Bạn cần tư vấn không?")
- ❌ CTA buttons ("Đăng ký ngay")
- ❌ Random marketing copy ("Giải pháp tối ưu nhất")
- ❌ Numbers / prices / addresses (these get verbatim preservation via prompt rules)
- ❌ Already-translated proper nouns (Pingpong, Payoneer, USPS, FedEx — model knows these)

### 13.3 Initial 25-term seed (DRAFT — needs operator review before Phase 1)

> Operator will review this list before SQL seed runs. Add/remove freely.

**brand** (5)
| VI | EN | ZH |
|---|---|---|
| THG Fulfill | THG Fulfill | THG Fulfill |
| THG Express | THG Express | THG Express |
| THG Warehouse | THG Warehouse | THG Warehouse |
| THG Dropship | THG Dropship | THG代发 |
| THG Order | THG Order | THG代购 |

**warehouse** (4)
| VI | EN | ZH |
|---|---|---|
| Kho Trung Quốc | China warehouse | 中国仓库 |
| Kho Việt Nam | Vietnam warehouse | 越南仓库 |
| Kho Mỹ | US warehouse | 美国仓库 |
| Hệ thống OMS | OMS system | OMS系统 |

**shipping** (6)
| VI | EN | ZH |
|---|---|---|
| Hàng lô | bulk shipping | 散货海运 |
| Hàng không thường | standard air | 标准空运 |
| Hàng không nhanh | express air | 快速空运 |
| Đường biển | sea freight | 海运 |
| Trọng lượng thể tích | volumetric weight | 体积重量 |
| Vùng sâu | remote area | 偏远地区 |

**ecommerce** (5)
| VI | EN | ZH |
|---|---|---|
| TMĐT | e-commerce | 电商 |
| Seller | seller | 卖家 |
| POD | print-on-demand | 按需印刷 |
| Order hộ | proxy purchasing | 代购 |
| Tracking real-time | real-time tracking | 实时追踪 |

**payments** (3)
| VI | EN | ZH |
|---|---|---|
| Đặt cọc | deposit | 定金 |
| Phí xử lý | handling fee | 处理费 |
| Phí dịch vụ | service fee | 服务费 |

**ecommerce-platforms** under category=ecommerce (2)
| VI | EN | ZH |
|---|---|---|
| TikTok Shop | TikTok Shop | TikTok Shop |
| 1688 / Taobao | 1688 / Taobao | 1688 / 淘宝 |

Total: 25 terms. Categories: brand (5) + warehouse (4) + shipping (6) +
ecommerce (5+2) + payments (3) = 25.

## 14. References

- v1 design discussion: chat transcript 2026-05-13
- Existing OpenAI integration: [src/features/copilot/copilot.openai.ts](../src/features/copilot/copilot.openai.ts)
- Existing translation schema: [db/migrations/0001_init.sql:62-75](../db/migrations/0001_init.sql) (the flat `translations` table — kept for UI labels, separate from this pipeline)
- Existing FAQ admin: [src/routes/admin/content/faqs/index.tsx](../src/routes/admin/content/faqs/index.tsx)
- Existing FAQ public API: [src/routes/api/v1/(public)/faqs/index.ts](../src/routes/api/v1/(public)/faqs/index.ts)
