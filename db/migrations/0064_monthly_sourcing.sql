-- 0064: Monthly "Top sản phẩm & nguồn hàng" PDFs.
--
-- A year is the admin unit.  It owns twelve month slots; each slot may publish
-- one ready PDF at the stable LP URL /thang-<month>-<year>.  `nav_active`
-- selects exactly one live year for the main-site dropdown; older live years
-- remain accessible by their direct URLs.

CREATE TABLE monthly_sourcing_years (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE CHECK (year BETWEEN 2020 AND 2100),
  title TEXT NOT NULL DEFAULT 'Top sản phẩm & nguồn hàng',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  nav_active INTEGER NOT NULL DEFAULT 0 CHECK (nav_active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- A partial uniqueness rule makes two simultaneous navigation years impossible
-- even if two editor requests race.  The service additionally requires the
-- selected year to be live.
CREATE UNIQUE INDEX idx_monthly_sourcing_one_active_year
  ON monthly_sourcing_years(nav_active) WHERE nav_active = 1;

CREATE TABLE monthly_sourcing_months (
  id INTEGER PRIMARY KEY,
  year_id INTEGER NOT NULL REFERENCES monthly_sourcing_years(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  title TEXT NOT NULL,
  pdf_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (year_id, month)
);

CREATE INDEX idx_monthly_sourcing_months_year_status
  ON monthly_sourcing_months(year_id, status, month);
