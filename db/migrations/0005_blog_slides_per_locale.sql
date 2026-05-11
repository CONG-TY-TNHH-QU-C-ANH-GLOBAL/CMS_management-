-- Backfill blog_slides for VI + ZH locales.
-- Original blog migration only attached slides to EN posts. This copies them
-- (same media_id, position, alt_text) to VI/ZH posts of the same slug.
-- Idempotent: NOT EXISTS guard skips if VI/ZH already have slides.

INSERT INTO blog_slides (post_id, position, media_id, alt_text)
SELECT vi_post.id, en_slides.position, en_slides.media_id, en_slides.alt_text
  FROM blog_posts en_post
  JOIN blog_slides en_slides ON en_slides.post_id = en_post.id
  JOIN blog_posts vi_post ON vi_post.slug = en_post.slug AND vi_post.locale = 'vi'
 WHERE en_post.locale = 'en'
   AND NOT EXISTS (SELECT 1 FROM blog_slides WHERE post_id = vi_post.id);

INSERT INTO blog_slides (post_id, position, media_id, alt_text)
SELECT zh_post.id, en_slides.position, en_slides.media_id, en_slides.alt_text
  FROM blog_posts en_post
  JOIN blog_slides en_slides ON en_slides.post_id = en_post.id
  JOIN blog_posts zh_post ON zh_post.slug = en_post.slug AND zh_post.locale = 'zh'
 WHERE en_post.locale = 'en'
   AND NOT EXISTS (SELECT 1 FROM blog_slides WHERE post_id = zh_post.id);
