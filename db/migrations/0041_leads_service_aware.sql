-- Service-aware, MULTI-INTENT leads (land-and-expand). A lead is not one exclusive service:
-- it has an optional primary intent plus zero or more service interests, each with optional
-- schema-validated details. All columns are nullable so this migration deploys safely BEFORE the
-- new landing client — legacy serviceless leads keep working and persist unclassified (NEVER
-- defaulted to fulfill).
--
--   primary_service         highest-priority intent AT CAPTURE (not a permanent classification).
--                           Enum validation is app-layer (src/features/leads/lead-request.ts),
--                           NOT a DB CHECK — the canonical registry is code-owned and extensible
--                           without a migration.
--   surface                 UI-surface attribution — a SEPARATE dimension from service intent,
--                           source_page and utm.
--   service_interests_json  JSON array of canonical service keys (primary + secondaries).
--                           Cross-service interest stays queryable via
--                           json_each(service_interests_json). NULL/absent = generic/unclassified.
--   service_details_json    JSON object keyed by service key → details validated by that service's
--                           strict schema (keys are a subset of service_interests). Holds only
--                           validated data — never an arbitrary metadata bag.
--
-- JSON (not a normalized lead_service_interests child table) is a deliberate choice for D1:
-- SQLite/D1 has no interactive transaction, so a parent→child insert would be a non-atomic
-- two-phase write (children need the RETURNING id; batch() can't read a prior RETURNING). Lead
-- capture is write-light / admin-read and json_each covers cross-service queries, so the child
-- table is disproportionate here. It remains the documented upgrade path if lead volume or
-- opportunity-level querying grows.
ALTER TABLE leads ADD COLUMN primary_service TEXT;
ALTER TABLE leads ADD COLUMN surface TEXT;
ALTER TABLE leads ADD COLUMN service_interests_json TEXT;
ALTER TABLE leads ADD COLUMN service_details_json TEXT;

-- Justified by routing/admin triage on the primary intent ("leads whose primary is fulfill").
-- Secondary-interest lookups use json_each and need no dedicated index at this scale.
CREATE INDEX idx_leads_primary_service ON leads(primary_service);
