-- 0007: about-video URL on site_settings (homepage AboutVideoSection)
--
-- Operators paste a YouTube link in /admin/system/settings; the landing's
-- AboutVideoSection consumes it via GET /api/v1/site-settings. Title and
-- 4 highlight labels stay in the translations table.

ALTER TABLE site_settings ADD COLUMN about_video_url TEXT;
