-- 0009: extend media table for the new Media Library admin page.
--
-- Adds fields to support: a public URL (resolved at upload time so landing can
-- consume without joining), an operator-set tag/category, an optional human
-- title for the picker UI, and a thumb URL when image variants are generated.

ALTER TABLE media ADD COLUMN url TEXT;
ALTER TABLE media ADD COLUMN thumb_url TEXT;
ALTER TABLE media ADD COLUMN tag TEXT;
ALTER TABLE media ADD COLUMN title TEXT;

CREATE INDEX IF NOT EXISTS idx_media_tag ON media(tag, status);
