-- Editorial-only metadata; excluded from public DTOs and translation source hashes.
ALTER TABLE blog_posts ADD COLUMN focus_keyword TEXT CHECK (length(focus_keyword) <= 200);
ALTER TABLE events ADD COLUMN focus_keyword TEXT CHECK (length(focus_keyword) <= 200);
