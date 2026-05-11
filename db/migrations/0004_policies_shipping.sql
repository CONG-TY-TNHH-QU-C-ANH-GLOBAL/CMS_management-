-- Extend policies with icon + image-vs-text mode fields.
ALTER TABLE policies ADD COLUMN icon TEXT;
ALTER TABLE policies ADD COLUMN mode TEXT NOT NULL DEFAULT 'text' CHECK (mode IN ('image', 'text'));
ALTER TABLE policies ADD COLUMN image_list_json TEXT;
ALTER TABLE policies ADD COLUMN summary TEXT;
ALTER TABLE policies ADD COLUMN position INTEGER NOT NULL DEFAULT 99;
CREATE INDEX IF NOT EXISTS idx_policies_position ON policies(position);

-- New: shipping_routes (one row per route+locale)
CREATE TABLE IF NOT EXISTS shipping_routes (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  position INTEGER NOT NULL DEFAULT 99,
  title TEXT NOT NULL,
  origin TEXT,                    -- VN | CN | Global
  destination TEXT,               -- US | EU | WW etc
  kind TEXT,                      -- regular | cosmetics | batteries | priority
  body_md TEXT,                   -- detailed terms
  notes_json TEXT,                -- array of note strings
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('draft', 'live', 'archived')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (slug, locale)
);
CREATE INDEX IF NOT EXISTS idx_shipping_routes_slug ON shipping_routes(slug);
CREATE INDEX IF NOT EXISTS idx_shipping_routes_position ON shipping_routes(position);

-- Tables nested inside each route
CREATE TABLE IF NOT EXISTS shipping_route_tables (
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES shipping_routes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  columns_json TEXT NOT NULL,    -- array of {key, label}
  rows_json TEXT NOT NULL        -- array of objects matching columns
);
CREATE INDEX IF NOT EXISTS idx_shipping_route_tables_route ON shipping_route_tables(route_id, position);
