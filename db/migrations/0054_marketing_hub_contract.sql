-- Dedicated Marketing Hub contract, not the legacy bearer-token Event agent.
-- All flags default OFF. No existing route or secret changes are required.
CREATE TABLE marketing_hub_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CONSTRAINT marketing_hub_conflict CHECK(valid=1)
);
CREATE TABLE marketing_hub_contents (
  external_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('event','blog')),
  slug TEXT NOT NULL, locale TEXT NOT NULL, content_id INTEGER NOT NULL,
  source_revision INTEGER NOT NULL, cms_revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, projection_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(kind,slug,locale), UNIQUE(kind,content_id)
);
CREATE TABLE marketing_hub_commands (
  command_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL, response_status INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE marketing_hub_outbox (
  event_id TEXT PRIMARY KEY, external_id TEXT NOT NULL, cms_revision INTEGER NOT NULL,
  source_payload_json TEXT NOT NULL, snapshot_json TEXT NOT NULL, publisher_id INTEGER,
  posted_at TEXT NOT NULL, payload_json TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','retry_wait','succeeded','blocked')),
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, lease_token TEXT, lease_until TEXT,
  error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(external_id,cms_revision)
);
CREATE INDEX marketing_hub_outbox_due ON marketing_hub_outbox(state,next_attempt_at,lease_until);
-- Blog author is not necessarily the publishing editor. Keep that distinction.
ALTER TABLE blog_posts ADD COLUMN updated_by INTEGER REFERENCES users(id);
UPDATE blog_posts SET updated_by=author_id;

-- Triggers make publication receipt durable with the actual CMS save, even if
-- the Worker stops before hooks/cron. They never publish content themselves.
CREATE TRIGGER marketing_hub_event_changed AFTER UPDATE ON events
WHEN EXISTS(SELECT 1 FROM marketing_hub_contents WHERE kind='event' AND content_id=NEW.id)
BEGIN
  UPDATE marketing_hub_contents SET cms_revision=cms_revision+1,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE kind='event' AND content_id=NEW.id;
  INSERT INTO marketing_hub_outbox
    (event_id,external_id,cms_revision,source_payload_json,snapshot_json,publisher_id,posted_at,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),external_id,cms_revision,payload_json,
    json_object('title',NEW.title,'summary',NEW.summary,'body_md',NEW.body_md,'event_date',NEW.event_date,
      'end_date',NEW.end_date,'location',NEW.location,'role',NEW.role,'url',NEW.url,'video_url',NEW.video_url,
      'seo_title',NEW.seo_title,'seo_description',NEW.seo_description),NEW.updated_by,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM marketing_hub_contents WHERE kind='event' AND content_id=NEW.id AND NEW.status='live';
END;
CREATE TRIGGER marketing_hub_blog_changed AFTER UPDATE ON blog_posts
WHEN EXISTS(SELECT 1 FROM marketing_hub_contents WHERE kind='blog' AND content_id=NEW.id)
BEGIN
  UPDATE marketing_hub_contents SET cms_revision=cms_revision+1,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE kind='blog' AND content_id=NEW.id;
  INSERT INTO marketing_hub_outbox
    (event_id,external_id,cms_revision,source_payload_json,snapshot_json,publisher_id,posted_at,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),external_id,cms_revision,payload_json,
    json_object('title',NEW.title,'excerpt',NEW.excerpt,'body_md',NEW.body_md,'category',NEW.category,
      'published_date',NEW.published_date,'seo_title',NEW.seo_title,'seo_description',NEW.seo_description),NEW.updated_by,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM marketing_hub_contents WHERE kind='blog' AND content_id=NEW.id AND NEW.status='live';
END;
