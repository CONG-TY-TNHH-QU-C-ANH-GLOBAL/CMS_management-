-- SEO control plane and qualified-lead funnel. Additive for safe CMS-first rollout.
ALTER TABLE pages ADD COLUMN indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0, 1));
ALTER TABLE pages ADD COLUMN og_image_url TEXT;
ALTER TABLE pages ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'draft' CHECK (
  translation_status IN ('draft', 'reviewed', 'stale')
);
CREATE INDEX idx_pages_public_seo ON pages(status, indexable, route, locale);

WITH routes(route, title) AS (VALUES
  ('/', 'THG Fulfill'),
  ('/thg-fulfill', 'THG Fulfill Service'),
  ('/thg-express', 'THG Express'),
  ('/thg-warehouse', 'THG Warehouse'),
  ('/thg-order', 'THG Order'),
  ('/catalog', 'THG Catalog'),
  ('/careers', 'Careers at THG'),
  ('/community', 'THG Community'),
  ('/community/reviews', 'THG Customer Reviews'),
  ('/blog', 'THG Blog'),
  ('/policy', 'THG Policies'),
  ('/shipping-policy', 'THG Shipping Policy'),
  ('/international-pricing', 'International Shipping Rates'),
  ('/chinh-ngach-pricing', 'Formal Customs Shipping Rates'),
  ('/domestic-pricing', 'US 3PL Warehouse Rates')
), locales(locale) AS (VALUES ('vi'), ('en'), ('zh'))
INSERT OR IGNORE INTO pages(route, locale, title, meta_description, indexable, status)
SELECT routes.route, locales.locale, routes.title, NULL, 1, 'draft'
FROM routes CROSS JOIN locales;

ALTER TABLE leads ADD COLUMN company_url TEXT;
ALTER TABLE leads ADD COLUMN monthly_order_band TEXT CHECK (
  monthly_order_band IN ('<100', '100_499', '500_1999', '2000_plus')
);
ALTER TABLE leads ADD COLUMN ship_to_markets_json TEXT;
ALTER TABLE leads ADD COLUMN pipeline_status TEXT NOT NULL DEFAULT 'new' CHECK (
  pipeline_status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')
);
ALTER TABLE leads ADD COLUMN lost_reason TEXT;
ALTER TABLE leads ADD COLUMN first_response_at INTEGER;
ALTER TABLE leads ADD COLUMN status_updated_at INTEGER NOT NULL DEFAULT (unixepoch());
UPDATE leads
SET pipeline_status = CASE status
  WHEN 'contacted' THEN 'contacted'
  WHEN 'qualified' THEN 'qualified'
  WHEN 'closed' THEN 'proposal'
  WHEN 'spam' THEN 'lost'
  ELSE 'new'
END,
lost_reason = CASE WHEN status = 'spam' THEN 'Legacy spam' ELSE lost_reason END,
first_response_at = CASE WHEN status <> 'new' THEN created_at ELSE first_response_at END,
status_updated_at = created_at;
CREATE INDEX idx_leads_pipeline_status ON leads(pipeline_status, created_at);
