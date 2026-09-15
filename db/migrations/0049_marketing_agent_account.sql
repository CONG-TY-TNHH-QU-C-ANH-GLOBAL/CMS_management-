-- Service account for the marketing tool's writer agent.
--
-- WHY A REAL ROW. `events.updated_by` and `audit_log.actor_id` both REFERENCE
-- users(id). Existing code writes a literal 0 as a "system actor" (blog-bot's
-- scheduled runs do this), on the stated assumption that D1 does not enforce
-- foreign keys. That assumption does not hold: a local `wrangler dev` D1 rejects
-- the insert outright with SQLITE_CONSTRAINT_FOREIGNKEY. So an agent write needs
-- an actor that exists, and inventing one per integration is how you end up with
-- an audit trail full of ids that resolve to nothing.
--
-- WHY IT IS DISABLED. status='disabled' is refused by BOTH login paths before a
-- session is issued (auth.service.ts checks it for the password flow and again
-- for the Google flow), so this row can never become a logged-in user no matter
-- who controls the address. password_hash stays NULL for the same reason.
-- The row exists to NAME the writer in the audit log and satisfy the FK — it is
-- not a credential, and the agent's actual credential is the
-- MARKETING_AGENT_TOKEN bearer secret, which grants nothing but draft creation.
--
-- role='editor' records the privilege its writes correspond to (content author,
-- not admin). The agent cannot act on it — there is no session to carry it.
--
-- Resolved by EMAIL at runtime rather than by a hardcoded id: `users.id` is a
-- plain INTEGER PRIMARY KEY, so the value this INSERT lands on differs between
-- prod, preview and a fresh local database.
--
-- Idempotent: re-running the migration, or applying it to a database where an
-- operator already created the address, leaves the existing row untouched.

INSERT INTO users (email, name, role, status, provider, created_at)
VALUES (
  'marketing-agent@thgfulfill.com',
  'Marketing Agent (tự động)',
  'editor',
  'disabled',
  'local',
  unixepoch()
)
ON CONFLICT(email) DO NOTHING;
