-- Leadership cards shown on the landing homepage.
-- A card may represent one person or a team. Avatars live in a child table so
-- operators can attach one portrait or an ordered group without JSON blobs.

CREATE TABLE leadership_members (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  quote TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_leadership_status_position
  ON leadership_members(status, position, id);

CREATE TABLE leadership_member_avatars (
  leadership_id INTEGER NOT NULL REFERENCES leadership_members(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (leadership_id, media_id)
);
CREATE INDEX idx_leadership_avatars_order
  ON leadership_member_avatars(leadership_id, position, media_id);
