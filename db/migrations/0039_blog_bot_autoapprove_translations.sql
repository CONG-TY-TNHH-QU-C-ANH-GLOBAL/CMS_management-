-- 0039: Blog Auto-Bot — per-campaign opt-in to auto-approve EN/ZH translations.
--
-- ADDITIVE ONLY: one new column on the bot's own table (blog_bot_campaigns).
-- Touches nothing any existing production feature reads/writes — safe for prod.
--
-- When a campaign auto-publishes a VI post (autopublish=1 AND verifier passed),
-- the existing blog translation pipeline has already created EN/ZH DRAFT
-- translations. With autoapprove_translations=1 the bot also flips those drafts
-- to 'reviewed' so the post is public in all three languages. Default 0 keeps
-- the moderation-first behavior: translations wait for a human (Rule 12).
--
-- Note: the translations are NOT re-run through the content verifier — they are
-- a faithful rendering of the already-verified VI article, so the residual risk
-- is mistranslation (quality), not unsafe content. Opt-in per campaign.

ALTER TABLE blog_bot_campaigns
  ADD COLUMN autoapprove_translations INTEGER NOT NULL DEFAULT 0;
