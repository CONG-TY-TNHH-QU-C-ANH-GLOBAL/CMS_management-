-- Events whose body_md stores the two characters backslash-n instead of a real
-- newline, so the landing page renders the whole article as one paragraph with
-- "\n\n" and "###" printed as literal text.
--
-- Both live events are affected (22 and 5 occurrences); blog posts are clean,
-- which places the fault on the event ingest path rather than on storage. The
-- CMS never touches body_md — the ingest schema is optionalText(60_000) and
-- nothing unescapes — so the producer JSON-encoded the payload twice. The
-- ingest guard added alongside this migration stops it recurring; this only
-- repairs what is already stored.
--
-- THE GUARD IN THE WHERE CLAUSE IS THE WHOLE POINT. A row is rewritten only
-- when it contains backslash-n AND contains no real newline at all. Markdown
-- legitimately carries backslash-n inside code fences and escape examples, and
-- a blanket replace would corrupt those. A document with zero real newlines but
-- many backslash-n is not a document that meant them literally — that
-- combination only happens through double encoding.
--
-- instr() rather than LIKE: SQLite's LIKE gives no special meaning to
-- backslash, but instr() removes any doubt about pattern interpretation.
-- char(10) is the newline; SQLite string literals have no escape sequences, so
-- '\n' below is genuinely the two characters.

UPDATE events
SET body_md    = replace(body_md, '\n', char(10)),
    updated_at = unixepoch()
WHERE body_md IS NOT NULL
  AND instr(body_md, '\n') > 0
  AND instr(body_md, char(10)) = 0;

-- Same repair for translated bodies. Empty today — no event has a reviewed
-- translation yet — but an AI translation carries the source's shape, so a
-- translation produced before the guard landed would have inherited this.
UPDATE event_translations
SET body_md    = replace(body_md, '\n', char(10)),
    updated_at = unixepoch()
WHERE body_md IS NOT NULL
  AND instr(body_md, '\n') > 0
  AND instr(body_md, char(10)) = 0;
