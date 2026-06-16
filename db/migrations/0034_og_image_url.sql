-- Add og_image_url to site_settings so admins can control the default
-- Open Graph thumbnail that appears when sharing thgfulfill.com on Facebook/Zalo.
-- The landing page deploy pipeline reads this value and injects it into dist/index.html.
ALTER TABLE site_settings ADD COLUMN og_image_url TEXT;
-- Seed with current favicon so existing row already has a value
UPDATE site_settings SET og_image_url = 'https://thgfulfill.com/thg-brand-icon.png' WHERE id = 1 AND og_image_url IS NULL;
