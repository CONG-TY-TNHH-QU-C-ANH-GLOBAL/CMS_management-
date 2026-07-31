-- 0040: Blog Auto-Bot — per-campaign article type, length, and depth.
--
-- ADDITIVE ONLY: three new columns on the bot's own table (blog_bot_campaigns).
-- Touches nothing any existing production feature reads/writes — safe for prod.
--
-- article_type drives the writing structure (and, for 'news', a Google News RSS
-- fetch that feeds recent-headline context to the model so it can synthesize an
-- original, source-cited roundup). length + depth tune word count and
-- professionalism. All default to values that reproduce the previous behavior
-- (general / medium / professional), so existing campaigns are unaffected.

ALTER TABLE blog_bot_campaigns
  ADD COLUMN article_type TEXT NOT NULL DEFAULT 'general'
  CHECK (article_type IN ('general', 'listicle', 'news', 'review', 'knowledge', 'product_service'));

ALTER TABLE blog_bot_campaigns
  ADD COLUMN length TEXT NOT NULL DEFAULT 'medium'
  CHECK (length IN ('short', 'medium', 'long'));

ALTER TABLE blog_bot_campaigns
  ADD COLUMN depth TEXT NOT NULL DEFAULT 'professional'
  CHECK (depth IN ('basic', 'professional', 'expert'));
