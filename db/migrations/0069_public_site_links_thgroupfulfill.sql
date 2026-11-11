-- The public site moved from thgfulfill.com to thgroupfulfill.com. Campaign menu items and a
-- campaign's landing_path can hold an absolute https link to the old public site that an editor
-- pasted in the admin; the API returns them verbatim, so the website kept linking to the old domain.
--
-- Only the exact prefix "https://thgfulfill.com/" is rewritten, and only on rows that still contain
-- it (idempotent: a second run touches nothing, later CMS edits are never overwritten). Internal
-- hosts (cms., lp., hub.) do not match the prefix and stay as they are.
--
-- DEPLOY ORDER: apply this migration (manual "Apply D1 Migrations" workflow), then purge the CMS
-- KV cache (migrations skip bumpCmsRev()) and redeploy the landing so it prerenders the new links.

UPDATE campaigns
SET menu_items_json = replace(menu_items_json, 'https://thgfulfill.com/', 'https://thgroupfulfill.com/')
WHERE instr(menu_items_json, 'https://thgfulfill.com/') > 0;

UPDATE campaigns
SET landing_path = replace(landing_path, 'https://thgfulfill.com/', 'https://thgroupfulfill.com/')
WHERE instr(landing_path, 'https://thgfulfill.com/') > 0;

UPDATE campaign_translations
SET menu_items_json = replace(menu_items_json, 'https://thgfulfill.com/', 'https://thgroupfulfill.com/')
WHERE instr(menu_items_json, 'https://thgfulfill.com/') > 0;
