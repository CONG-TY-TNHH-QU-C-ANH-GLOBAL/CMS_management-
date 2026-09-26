-- New thgfulfill.com submissions become Sales Hub consultations first, while
-- historical outbox rows retain their original direct-Lead projection.
ALTER TABLE leads ADD COLUMN crm_projection TEXT NOT NULL DEFAULT 'lead'
  CHECK(crm_projection IN ('lead','consultation'));
ALTER TABLE leads ADD COLUMN visitor_country TEXT;
ALTER TABLE leads ADD COLUMN visitor_region TEXT;
ALTER TABLE leads ADD COLUMN visitor_city TEXT;
ALTER TABLE leads ADD COLUMN visitor_timezone TEXT;
