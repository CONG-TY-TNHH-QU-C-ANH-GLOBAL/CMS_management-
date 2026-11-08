-- Pre-rendered page images for the monthly sourcing landing pages. The admin browser renders
-- each PDF page to a small WebP at upload time, so lp.thgfulfill.com can show page 1 at once
-- instead of downloading a 20-40 MB PDF first. pdf_media_id records which PDF the images were
-- made from: replacing the month's PDF makes the old images stop applying (the landing falls
-- back to the PDF viewer until pages are regenerated).
CREATE TABLE IF NOT EXISTS monthly_sourcing_pages (
  id INTEGER PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES monthly_sourcing_months(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL CHECK (page_no BETWEEN 1 AND 200),
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  pdf_media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 6000),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 8000),
  UNIQUE (month_id, page_no)
);

CREATE INDEX IF NOT EXISTS idx_monthly_sourcing_pages_month ON monthly_sourcing_pages(month_id, page_no);
