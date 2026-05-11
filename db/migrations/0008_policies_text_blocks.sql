-- 0008: structured text blocks for policies (per locale).
--
-- Replaces the hardcoded `policyTextContent.ts` in THG_landingpage. Each
-- locale row may hold either an image list, a body_md string, OR a
-- text_blocks_json array — landing renders whichever the operator filled.
--
-- Schema: text_blocks_json = JSON array of:
--   { type: "normal" | "warn" | "info", heading: string, content: [string, ...] }

ALTER TABLE policies ADD COLUMN text_blocks_json TEXT;

-- Extend the mode CHECK constraint to allow new "text_blocks" mode value.
-- SQLite can't ALTER CHECK; we rely on application code respecting "mode".
-- Existing rows already use 'image' or 'text'; new mode 'text_blocks' is
-- enforced via Zod at the API layer, not the DB.
