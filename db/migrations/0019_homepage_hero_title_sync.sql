-- 0019: re-sync homepage_blocks hero.title with the live i18n composition.
--
-- HeroSection (THG_landingpage) used to ignore homepage_blocks.hero.title
-- and render the title from 4 hardcoded i18n keys (hero.title1 +
-- hero.title_highlight + hero.title2 + hero.title3) so two words in the
-- middle could be gold-highlighted. The CMS still saved `title` to DB but
-- nothing read it, so the seed value drifted from what users actually saw
-- on the page.
--
-- Now HeroSection reads hero.title and parses **word** markers as gold
-- spans, falling back to the i18n keys when title is empty. To avoid an
-- immediate visible regression on first deploy, this migration overwrites
-- the seed title in each locale with the exact i18n composition rewritten
-- in the new **highlight** syntax.
--
-- Safety: only updates rows whose title still equals the original 0012
-- seed string ("POD & Dropship fulfillment..."). Rows operators have
-- already edited via /admin/content/landing are left alone.

UPDATE homepage_blocks
SET payload_json = json_set(
  payload_json,
  '$.title',
  CASE locale
    WHEN 'vi' THEN 'Giải pháp **vận chuyển quốc tế** cho mọi **nhà bán hàng**'
    WHEN 'en' THEN 'Your Global **Fulfillment** Partner for **eCommerce Sellers**'
    WHEN 'zh' THEN '您的全球 **Fulfillment** 合作伙伴，为 **电商卖家**'
    ELSE json_extract(payload_json, '$.title')
  END
)
WHERE kind = 'hero'
  AND json_extract(payload_json, '$.title') = 'POD & Dropship fulfillment cho seller TikTok Shop, Shopify, Amazon';
