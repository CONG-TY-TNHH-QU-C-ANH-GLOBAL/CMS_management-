# CMS to CRM website lead sync

`thgfulfill.com` continues to submit contact/quote forms only to CMS. CMS owns
Turnstile validation, rate limiting and the canonical `leads` row. It then
writes an immutable event to `crm_lead_outbox`; the scheduled Worker retries a
signed delivery to CRM.

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
payload changes.

## Operations

The cron reconciles CMS leads with no outbox row, so leads captured during an
outage (including legacy CMS leads) are safely backfilled. CRM deduplicates by
the CMS lead id; no manual replay should create another CRM lead.
