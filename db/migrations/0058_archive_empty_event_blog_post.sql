-- Takes the empty "Event" blog post off the website.
--
-- /vi/blog/event is a live post with a title and a category ("Event") and
-- nothing else: no excerpt, no body, no image, no published date. Because the
-- landing falls back to updated_at when published_date is empty, it sorts as
-- the newest post and fills the featured slot at the top of /vi/blog with a
-- blank white card. Events have had their own section (/events) since
-- migration 0043, so this placeholder has no job left.
--
-- Archived rather than deleted so it can be restored from the CMS editor
-- (status "Đã ẩn"). GUARDED: only a row that is still empty (excerpt, body and
-- thumbnail all NULL, as the live row is) is touched — if someone has written
-- the post in the meantime, it stays live. Archiving also removes "Event" from
-- the blog category filter, which lists categories of live posts only.

UPDATE blog_posts
SET status     = 'archived',
    updated_at = unixepoch()
WHERE slug = 'event'
  AND title = 'Event'
  AND status = 'live'
  AND excerpt IS NULL
  AND body_md IS NULL
  AND thumbnail_media_id IS NULL;
