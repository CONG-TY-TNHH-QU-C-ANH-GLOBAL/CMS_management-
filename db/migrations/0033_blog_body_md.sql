-- Add body_md (Markdown article content) to blog posts.
-- Nullable so existing posts without body content are unaffected.
ALTER TABLE blog_posts ADD COLUMN body_md TEXT;

-- Also add to translation table so editors can provide manual EN/ZH translations.
ALTER TABLE blog_post_translations ADD COLUMN body_md TEXT;
