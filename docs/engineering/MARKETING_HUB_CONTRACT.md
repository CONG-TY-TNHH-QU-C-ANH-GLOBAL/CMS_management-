# Marketing Hub contract v1

Companion CRM branch: `feat/marketing-hub`. CMS branch: `codex/marketing-hub-contract`.
Implementation is not deployment or a completed staging acceptance test.

## Rollout order and isolation

1. Use a separate staging D1 and MEDIA R2. Never reuse production IDs/secrets for local UAT.
2. Apply `db/migrations/0054_marketing_hub_contract.sql` before deploying this Worker. It adds the Blog publisher column used by normal CMS edits, too.
3. Keep `MARKETING_HUB_INGEST_ENABLED=false` and `MARKETING_HUB_CALLBACKS_ENABLED=false` until both sides are configured.
4. Configure `MARKETING_HUB_SIGNING_SECRET` as a dedicated secret, `MARKETING_HUB_CALLBACK_URL` as the staging CRM `/api/marketing/integrations/cms/events`, and `MARKETING_HUB_PUBLIC_ORIGIN` as the staging landing origin. HTTPS only.
5. Bootstrap a real active CMS administrator before the first machine ingest. Its disabled service account cannot log in.
6. Enable ingest, then callbacks. The callback cron is isolated from existing translations, leads, Telegram and Blog Bot work.

Legacy `POST /api/v1/agent/events` and `MARKETING_AGENT_TOKEN` stay unchanged. Do not substitute the lead-sync secret.

## Signed requests

Headers: `x-thg-contract: marketing-hub-content.v1`, unique `x-thg-event-id` (max 120 ASCII identifier characters), ISO `x-thg-timestamp`, and `x-thg-signature: v1=<hex HMAC-SHA256>`.
Signed text is `timestamp + "\n" + eventId + "\n" + rawBody`. Clock skew limit: five minutes. GET has an empty body. Refresh the timestamp/signature on a retry, but retain event ID and exact body. Machine routes have no browser CORS and return `Cache-Control: no-store`.

### POST /api/v1/agent/contents

Strict envelope: `schemaVersion:1`, `externalId:crm:<taskId>:<targetKey>`, `taskId`, `versionId`, `approvalId`, positive integer `sourceRevision`, `kind:event|blog`, `locale:vi|en|zh`, lowercase hyphenated `slug` (max120), `content`, `sourceLinks`, `contentHash`, `renderedContent`, `payloadHash`.

Hashes are SHA-256 of recursive key-sorted JSON: `contentHash` covers `content`; `payloadHash` covers the whole envelope excluding `payloadHash`. Arrays retain order. `renderedContent` is the approved, exact public field projection. Its required/nullable fields are defined once in `marketing-hub.schemas.ts`; no status or arbitrary column writes are accepted.

Creates a **draft only**. A new external ID cannot take over an existing manual draft with the same slug/locale. Updates must keep kind/slug/locale, have a higher source revision, and target an existing draft; live/review/archived records are refused. Commands, audit and draft writes commit in one D1 batch. Same event ID + same request returns the saved response; same event ID + another request is 409. An already successful command replay never rewrites a later publication.

The 201/200 acknowledgement contains `status:draft`, external/task/version/approval/source revision, both hashes and numeric `cmsRevision`. It is NOT publication evidence.

### GET /api/v1/agent/contents/{externalId}

Private signed status/provenance and last twenty callback states. Validated against the feature's canonical response schema; deliberately excluded from the public landing OpenAPI and explicitly classified as service-HMAC in the route inventory. Used for manual reconciliation only; it does not complete a CRM task.

### POST /api/v1/agent/media

JSON `{mime,dataBase64,altText}`. PNG/JPEG/WebP only, decoded size max1MiB, UTF-8 JSON body max1.5MB, validated magic bytes. Objects are content-addressed under `marketing/`; duplicate retries cannot erase another command's object. Returns R2 key, public API path and SHA-256. No arbitrary remote URL fetching. A storage write preceding a failed database transaction may leave an unreferenced content-addressed object; do not delete it automatically without checking media references.

### Publication callback

Database triggers create a durable outbox row **in the CMS editor's actual save transaction** when a mapped record becomes/remains live. They store the publisher, exact content snapshot and CMS revision. Cron validates that this is still the current live revision, a human editor/admin published it, and its approved fields have not changed. Changed approved content is blocked (`APPROVED_CONTENT_CHANGED`) and must be revised/reapproved in Hub; never falsely mark it completed.

Sends `{type:"content.published",data:{externalId,taskId,versionId,approvalId,sourceRevision,contentHash,payloadHash,cmsRevision,publicUrl,postedAt,publisher,slug,locale}}` with the same HMAC contract. Public URLs follow existing CMS editor links: `/{locale}/events/{slug}` or `/{locale}/blog/{slug}`.

CRM checks the signed provenance AND compares the existing public Event/Blog JSON with frozen `renderedContent`. Public APIs receive no private status/provenance fields. Reviewed translations can take precedence over an EN/ZH source: if they differ from the approved projection, verification intentionally fails closed and requires editorial reconciliation.

Lease token fencing, lease expiry recovery, 15s request timeout, maximum ten rows/50s cron pass, exponential retry at most eight attempts per cycle. 408/429/5xx/network errors retry; schema/auth/conflicts block. A succeeded callback is never resent by the retry action. Saved body/event ID stay stable.

### POST /api/v1/agent/callbacks/{eventId}/retry

Operator-triggered signed request `{expectedAttempts:<value from GET>}` with a new command ID. Only current-revision blocked/retry-wait events can restart. Attempts reset for the new cycle; previous count/state is retained in audit. Does not retry a stale or succeeded event, and does not rerun content ingest.

## Manual acceptance

- Approved CRM Blog and Event each create one draft; duplicate/conflicting command IDs behave as above.
- Invalid HMAC, oversized data, live overwrite, old source revision and manual slug collision are rejected without content changes.
- Publishing creates a callback transactionally. Losing the first response then retrying creates no second CRM reward.
- Changing approved fields in CMS blocks callback. Unpublishing before dispatch blocks callback.
- Stop callbacks: CRM remains approved and shows `Cần đối soát` after its configured grace period. Resume/retry the same callback only after checking its state.
- Baseline CMS Event/Blog editing, legacy agent ingest, media reads and independent cron workers must still pass before promotion.

No production deployment is authorized by these steps. Disabling flags stops new integration delivery, not existing CMS editing or historical evidence.
