-- Catalog-wide "price includes shipping" default.
--
-- 0068 made the flag per product: every product without a row showed
-- "not including shipping cost", so Sales had to add every product one by one
-- even though the whole catalog is priced with shipping included. This adds one
-- catalog-wide default and turns the per-product flag into an exception:
--
--   catalog_settings.price_includes_shipping_default   applies to every product
--   catalog_product_overrides.price_includes_shipping  NULL = follow the default,
--                                                      0/1 = explicit exception
--
-- Existing rows: 0 was what the old checkbox stored when left unticked, i.e.
-- "the default", so it becomes NULL. 1 stays an explicit "includes shipping".

CREATE TABLE IF NOT EXISTS catalog_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  price_includes_shipping_default INTEGER NOT NULL DEFAULT 1
    CHECK (price_includes_shipping_default IN (0, 1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Sales confirmed: all catalog prices include shipping.
INSERT OR IGNORE INTO catalog_settings (id, price_includes_shipping_default) VALUES (1, 1);

-- SQLite cannot drop NOT NULL in place: rebuild the table. Nothing references it.
CREATE TABLE catalog_product_overrides_new (
  id INTEGER PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,
  label TEXT,
  template_url TEXT,
  price_includes_shipping INTEGER CHECK (price_includes_shipping IN (0, 1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO catalog_product_overrides_new
  (id, product_id, label, template_url, price_includes_shipping, updated_at, updated_by)
SELECT id, product_id, label, template_url,
       CASE WHEN price_includes_shipping = 1 THEN 1 ELSE NULL END,
       updated_at, updated_by
FROM catalog_product_overrides;

DROP TABLE catalog_product_overrides;
ALTER TABLE catalog_product_overrides_new RENAME TO catalog_product_overrides;
