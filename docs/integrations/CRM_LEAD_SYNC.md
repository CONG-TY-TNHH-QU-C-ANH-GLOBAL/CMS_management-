# CMS to Sales Hub website consultation sync

`thgfulfill.com` continues to submit contact/quote forms only to CMS. CMS owns
Turnstile validation, rate limiting and the canonical `leads` row. It then
writes an immutable event to `crm_lead_outbox`; the scheduled Worker retries a
signed delivery to Sales Hub.

New public form submissions are emitted as `schemaVersion: 2` /
`consultation.created`. Sales Hub creates a website consultation ticket first;
an employee explicitly converts it to a Lead later. Historical rows keep the
`lead.created` v1 projection so retries remain backward compatible and do not
change already-captured business state.

## Production configuration

- `CRM_LEAD_SYNC_URL` is a normal Worker variable and is set to
  `https://crm.thgfulfill.com/api/integrations/cms/leads`.
- Set the same high-entropy value as `CMS_CRM_SYNC_KEY` in CMS and
  `CMS_LEAD_SYNC_KEY` in CRM using each Worker's secret store.
- Do not put either secret in source, a `.dev.vars` file committed to Git, logs,
  GitHub Actions output, or a browser bundle.

The request signature is HMAC-SHA256 over `<unix-seconds>.<raw-json>`, carried
in `x-thg-timestamp` and `x-thg-signature`. CRM accepts a five-minute clock
window, records `(THG_CMS, cms:lead:<id>)`, and rejects a reused event id whose
payload changes. A v2 success response must contain `ticketId`; a legacy v1
success response must contain `leadCode`.

## Operations

The cron reconciles CMS leads with no outbox row, so submissions captured
during an outage are safely backfilled according to their persisted
`crm_projection`. Sales Hub deduplicates by the CMS event id; no manual replay
should create another consultation or Lead.
