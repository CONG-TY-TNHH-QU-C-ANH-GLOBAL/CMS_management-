-- Per-product catalog settings the operator controls from the CMS.
--
-- The catalog itself (products, variants, prices) lives in the Hub and reaches
-- the landing from hub.thgfulfill.com. Two things the Hub does not carry, or
-- does not expose publicly, are set here instead, keyed by the Hub product id:
--
--   template_url              link to the product's design template, shown as
--                             "Download Template" so customers stop asking for
--                             it one by one. Overrides the Hub's own templateUrl
--                             when set.
--   price_includes_shipping   the catalog price already includes shipping, so
--                             the landing must not say "not including shipping
--                             cost" under it.
--
-- One row per product: a product with no row behaves exactly as before.

CREATE TABLE IF NOT EXISTS catalog_product_overrides (
  id INTEGER PRIMARY KEY,
  -- Hub product id (cuid), the `productId` in a thgfulfill.com/catalog link.
  product_id TEXT NOT NULL UNIQUE,
  -- Operator-facing name so the admin list is readable; not shown on the site.
  label TEXT,
  template_url TEXT,
  price_includes_shipping INTEGER NOT NULL DEFAULT 0 CHECK (price_includes_shipping IN (0, 1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- The two products Sales has confirmed are priced with shipping included.
-- Hoodie Washed was previously hard-coded in the landing by SKU prefix; it
-- moves here so the label is controlled from one place.
INSERT OR IGNORE INTO catalog_product_overrides (product_id, label, price_includes_shipping)
VALUES
  ('cmvj0lyc401v801obxylh5mfo', 'Hoodie Washed', 1),
  ('cmvaoi0av0a4201sciqgwlhpa', 'Notebook Set (made in USA)', 1);
