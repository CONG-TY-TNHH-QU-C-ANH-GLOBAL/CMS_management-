-- Brand: "TH Group Fulfill" becomes "TH Group" in CMS copy.
--
-- TH Group is the company; Fulfill is one of its service lines, alongside
-- Express, Warehouse and Dropship. Company references drop "Fulfill";
-- references to the Fulfill service line keep it:
--   - translations nav.thg_fulfill, services.s1_title, fulfill_page.*
--   - the thg-fulfill service (services_i18n) and its "… Fulfill Service" pages
--   - brand lists ("TH Group Express, TH Group Fulfill, TH Group Warehouse")
--     and markdown links to the /thg-fulfill page
--   - glossary terms (the translation tool's term list, not page copy)
--
-- Rows are named by key (translations) or id, as read from production, and
-- each statement runs only while the old text is still there, so a re-run is
-- a no-op. "TH Group Fulfillment" is replaced before "TH Group Fulfill" so it
-- never becomes "TH Groupment".
--
-- Generated from the production rows read on 2026-10-18 (read-only query).

UPDATE blog_posts SET body_md = REPLACE(REPLACE(body_md, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (71, 76, 77, 78, 79, 80, 81, 82, 83) AND instr(body_md, 'TH Group Fulfill') > 0;

UPDATE careers_job_translations SET body_md = REPLACE(REPLACE(body_md, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2, 15, 16) AND instr(body_md, 'TH Group Fulfill') > 0;

UPDATE careers_job_translations SET lead = REPLACE(REPLACE(lead, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2, 3, 4, 9, 10, 15, 16, 17, 18) AND instr(lead, 'TH Group Fulfill') > 0;

UPDATE careers_job_translations SET source_snapshot = REPLACE(REPLACE(source_snapshot, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (3, 4, 10, 15, 16, 17, 18) AND instr(source_snapshot, 'TH Group Fulfill') > 0;

UPDATE careers_jobs SET body_md = REPLACE(REPLACE(body_md, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (4, 5, 6, 25) AND instr(body_md, 'TH Group Fulfill') > 0;

UPDATE careers_jobs SET lead = REPLACE(REPLACE(lead, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (4, 5, 6, 7, 8, 9, 16, 17, 18, 25, 28) AND instr(lead, 'TH Group Fulfill') > 0;

UPDATE event_translations SET source_snapshot = REPLACE(REPLACE(source_snapshot, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2) AND instr(source_snapshot, 'TH Group Fulfill') > 0;

UPDATE events SET body_md = REPLACE(REPLACE(body_md, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (2) AND instr(body_md, 'TH Group Fulfill') > 0;

UPDATE events SET seo_description = REPLACE(REPLACE(seo_description, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1) AND instr(seo_description, 'TH Group Fulfill') > 0;

UPDATE events SET seo_title = REPLACE(REPLACE(seo_title, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2) AND instr(seo_title, 'TH Group Fulfill') > 0;

UPDATE events SET summary = REPLACE(REPLACE(summary, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2) AND instr(summary, 'TH Group Fulfill') > 0;

UPDATE faq_translations SET answer = REPLACE(REPLACE(answer, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2) AND instr(answer, 'TH Group Fulfill') > 0;

UPDATE faq_translations SET question = REPLACE(REPLACE(question, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2) AND instr(question, 'TH Group Fulfill') > 0;

UPDATE faqs SET answer = REPLACE(REPLACE(answer, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2, 3) AND instr(answer, 'TH Group Fulfill') > 0;

UPDATE faqs SET question = REPLACE(REPLACE(question, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2, 3) AND instr(question, 'TH Group Fulfill') > 0;

UPDATE leadership_members SET quote = REPLACE(REPLACE(quote, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (2) AND instr(quote, 'TH Group Fulfill') > 0;

UPDATE pages SET title = REPLACE(REPLACE(title, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2, 3) AND instr(title, 'TH Group Fulfill') > 0;

UPDATE service_block_translations SET description = REPLACE(REPLACE(description, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (23, 24) AND instr(description, 'TH Group Fulfill') > 0;

UPDATE service_blocks SET description = REPLACE(REPLACE(description, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (34, 35, 36) AND instr(description, 'TH Group Fulfill') > 0;

UPDATE shipping_route_translations SET source_snapshot = REPLACE(REPLACE(source_snapshot, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (19) AND instr(source_snapshot, 'TH Group Fulfill') > 0;

UPDATE shipping_routes SET body_md = REPLACE(REPLACE(body_md, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2, 3, 4, 5, 6) AND instr(body_md, 'TH Group Fulfill') > 0;

UPDATE site_settings SET brand_name = REPLACE(REPLACE(brand_name, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1) AND instr(brand_name, 'TH Group Fulfill') > 0;

UPDATE site_settings SET terminology_json = REPLACE(REPLACE(terminology_json, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1) AND instr(terminology_json, 'TH Group Fulfill') > 0;

UPDATE testimonial_translations SET quote = REPLACE(REPLACE(quote, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 5) AND instr(quote, 'TH Group Fulfill') > 0;

UPDATE testimonials SET quote = REPLACE(REPLACE(quote, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE id IN (1, 2, 3) AND instr(quote, 'TH Group Fulfill') > 0;

UPDATE translations SET value = REPLACE(REPLACE(value, 'TH Group Fulfillment', 'TH Group'), 'TH Group Fulfill', 'TH Group')
WHERE key IN ('about.title_highlight', 'about.video_desc', 'careers.hero_badge', 'careers.hero_desc', 'careers.hero_subtitle', 'careers.j2_desc', 'faq.a1', 'faq.q1', 'footer.copyright', 'op.hero_desc', 'op.sol1_d', 'order_page.hero_desc', 'testimonials.t1_quote') AND instr(value, 'TH Group Fulfill') > 0;

-- Values that also name the Fulfill line: only these snippets change, each
-- widened so the kept mention beside it is untouched.

UPDATE event_translations SET source_snapshot = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(source_snapshot, 'ook TH Group Fulfill](ht', 'ook TH Group](ht'), 'ube TH Group Fulfill](ht', 'ube TH Group](ht'), 'e | TH Group Fulfill","s', 'e | TH Group","s'), 'n":"TH Group Fulfill đồn', 'n":"TH Group đồn'), 'TH Group Fulfillment', 'TH Group')
WHERE id = 3 AND (instr(source_snapshot, 'ook TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'ube TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'e | TH Group Fulfill","s') > 0 OR instr(source_snapshot, 'n":"TH Group Fulfill đồn') > 0 OR instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE event_translations SET source_snapshot = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(source_snapshot, 'ook TH Group Fulfill](ht', 'ook TH Group](ht'), 'ube TH Group Fulfill](ht', 'ube TH Group](ht'), 'e | TH Group Fulfill","s', 'e | TH Group","s'), 'n":"TH Group Fulfill đồn', 'n":"TH Group đồn'), 'TH Group Fulfillment', 'TH Group')
WHERE id = 4 AND (instr(source_snapshot, 'ook TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'ube TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'e | TH Group Fulfill","s') > 0 OR instr(source_snapshot, 'n":"TH Group Fulfill đồn') > 0 OR instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE events SET body_md = REPLACE(REPLACE(REPLACE(body_md, 'ook TH Group Fulfill](ht', 'ook TH Group](ht'), 'ube TH Group Fulfill](ht', 'ube TH Group](ht'), 'TH Group Fulfillment', 'TH Group')
WHERE id = 1 AND (instr(body_md, 'ook TH Group Fulfill](ht') > 0 OR instr(body_md, 'ube TH Group Fulfill](ht') > 0 OR instr(body_md, 'TH Group Fulfillment') > 0);
