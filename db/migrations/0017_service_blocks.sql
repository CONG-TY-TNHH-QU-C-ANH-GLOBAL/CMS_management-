-- 0017: generic service_blocks table — pluggable per-page card sections.
--
-- Backs `/thg-order` (pain_points, process_steps, solutions, shipping_lanes,
-- policies, stats) plus future `/thg-fulfill`, `/thg-express`, `/thg-warehouse`
-- card-list sections. One table replaces ~6 per-page-per-kind tables that
-- would otherwise duplicate the same shape with different names.
--
-- Common columns live as actual columns (queryable / indexed); per-kind
-- extras (e.g. shipping-lane `features[]`, policy `items[]`, lane `time`,
-- stat `val` numeric prefix) live in `payload_json`.

CREATE TABLE service_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Which page renders this block. Matches the landing route slug
  -- ('thg-order', 'thg-fulfill', 'thg-express', 'thg-warehouse', …).
  page_slug TEXT NOT NULL,

  -- Block kind — drives which landing component renders it + which keys
  -- the renderer expects in `payload_json`. Free-form so adding a new
  -- kind doesn't need a migration.
  --   pain_point     {icon, title, description}
  --   process_step   {icon, title, description, payload.num}
  --   solution       {icon, title, description, payload.tag}
  --   shipping_lane  {icon, title, description, payload.{tag,time,features:string[],note}}
  --   policy         {icon, title, payload.{tag, items:string[]}}
  --   stat           {title, payload.val}
  kind TEXT NOT NULL,

  -- Sort order within (page_slug, kind, locale).
  position INTEGER NOT NULL,

  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),

  -- Emoji or short icon string. Nullable because some kinds (e.g. stat)
  -- have no icon.
  icon TEXT,

  -- Headline shown by the renderer. Most kinds need it; if a kind has
  -- no title, store the equivalent in payload_json.
  title TEXT,

  -- Body copy under the title. May contain `\n` for line breaks; the
  -- renderer applies `whitespace-pre-line`.
  description TEXT,

  -- Kind-specific extras as a JSON object. Always a valid JSON string
  -- (empty -> '{}'). Parsed and Zod-validated on the landing side.
  payload_json TEXT NOT NULL DEFAULT '{}',

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_service_blocks_lookup
  ON service_blocks(page_slug, kind, locale, position);
