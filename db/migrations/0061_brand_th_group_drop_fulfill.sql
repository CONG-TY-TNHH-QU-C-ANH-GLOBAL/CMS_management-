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
-- Each statement targets one row by key, rewrites only the listed snippets
-- (widened where needed so a kept mention in the same text is untouched), and
-- runs only while the old snippet is still present, so text an editor has
-- changed since is left alone and a re-run is a no-op. "TH Group Fulfillment"
-- is replaced before "TH Group Fulfill" so it never becomes "TH Groupment".
--
-- Generated from the production rows read on 2026-10-18 (read-only query).

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfillment', 'TH Group')
WHERE id = 71 AND (instr(body_md, 'TH Group Fulfillment') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfillment', 'TH Group')
WHERE id = 76 AND (instr(body_md, 'TH Group Fulfillment') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 77 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 78 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 79 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 80 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 81 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 82 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE blog_posts SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 83 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 3 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfill', 'TH Group')
WHERE id = 3 AND (instr(source_snapshot, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 4 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfill', 'TH Group')
WHERE id = 4 AND (instr(source_snapshot, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 9 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 10 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfill', 'TH Group')
WHERE id = 10 AND (instr(source_snapshot, 'TH Group Fulfill') > 0);

UPDATE careers_job_translations SET body_md = REPLACE(body_md, 'TH Group Fulfillment', 'TH Group')
WHERE id = 15 AND (instr(body_md, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfillment', 'TH Group')
WHERE id = 15 AND (instr(lead, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfillment', 'TH Group')
WHERE id = 15 AND (instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET body_md = REPLACE(body_md, 'TH Group Fulfillment', 'TH Group')
WHERE id = 16 AND (instr(body_md, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfillment', 'TH Group')
WHERE id = 16 AND (instr(lead, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfillment', 'TH Group')
WHERE id = 16 AND (instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfillment', 'TH Group')
WHERE id = 17 AND (instr(lead, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfillment', 'TH Group')
WHERE id = 17 AND (instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET lead = REPLACE(lead, 'TH Group Fulfillment', 'TH Group')
WHERE id = 18 AND (instr(lead, 'TH Group Fulfillment') > 0);

UPDATE careers_job_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfillment', 'TH Group')
WHERE id = 18 AND (instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE careers_jobs SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 4 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 4 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 5 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 5 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 6 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 6 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 7 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 8 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 9 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 16 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 17 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfill', 'TH Group')
WHERE id = 18 AND (instr(lead, 'TH Group Fulfill') > 0);

UPDATE careers_jobs SET body_md = REPLACE(body_md, 'TH Group Fulfillment', 'TH Group')
WHERE id = 25 AND (instr(body_md, 'TH Group Fulfillment') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfillment', 'TH Group')
WHERE id = 25 AND (instr(lead, 'TH Group Fulfillment') > 0);

UPDATE careers_jobs SET lead = REPLACE(lead, 'TH Group Fulfillment', 'TH Group')
WHERE id = 28 AND (instr(lead, 'TH Group Fulfillment') > 0);

UPDATE event_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(source_snapshot, 'TH Group Fulfill') > 0);

UPDATE event_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(source_snapshot, 'TH Group Fulfill') > 0);

UPDATE event_translations SET source_snapshot = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(source_snapshot, 'ook TH Group Fulfill](ht', 'ook TH Group](ht'), 'ube TH Group Fulfill](ht', 'ube TH Group](ht'), 'e | TH Group Fulfill","s', 'e | TH Group","s'), 'n":"TH Group Fulfill đồn', 'n":"TH Group đồn'), 'TH Group Fulfillment', 'TH Group')
WHERE id = 3 AND (instr(source_snapshot, 'ook TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'ube TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'e | TH Group Fulfill","s') > 0 OR instr(source_snapshot, 'n":"TH Group Fulfill đồn') > 0 OR instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE event_translations SET source_snapshot = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(source_snapshot, 'ook TH Group Fulfill](ht', 'ook TH Group](ht'), 'ube TH Group Fulfill](ht', 'ube TH Group](ht'), 'e | TH Group Fulfill","s', 'e | TH Group","s'), 'n":"TH Group Fulfill đồn', 'n":"TH Group đồn'), 'TH Group Fulfillment', 'TH Group')
WHERE id = 4 AND (instr(source_snapshot, 'ook TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'ube TH Group Fulfill](ht') > 0 OR instr(source_snapshot, 'e | TH Group Fulfill","s') > 0 OR instr(source_snapshot, 'n":"TH Group Fulfill đồn') > 0 OR instr(source_snapshot, 'TH Group Fulfillment') > 0);

UPDATE events SET summary = REPLACE(summary, 'TH Group Fulfillment', 'TH Group')
WHERE id = 1 AND (instr(summary, 'TH Group Fulfillment') > 0);

UPDATE events SET body_md = REPLACE(REPLACE(REPLACE(body_md, 'ook TH Group Fulfill](ht', 'ook TH Group](ht'), 'ube TH Group Fulfill](ht', 'ube TH Group](ht'), 'TH Group Fulfillment', 'TH Group')
WHERE id = 1 AND (instr(body_md, 'ook TH Group Fulfill](ht') > 0 OR instr(body_md, 'ube TH Group Fulfill](ht') > 0 OR instr(body_md, 'TH Group Fulfillment') > 0);

UPDATE events SET seo_title = REPLACE(seo_title, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(seo_title, 'TH Group Fulfill') > 0);

UPDATE events SET seo_description = REPLACE(seo_description, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(seo_description, 'TH Group Fulfill') > 0);

UPDATE events SET summary = REPLACE(summary, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(summary, 'TH Group Fulfill') > 0);

UPDATE events SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE events SET seo_title = REPLACE(seo_title, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(seo_title, 'TH Group Fulfill') > 0);

UPDATE faq_translations SET question = REPLACE(question, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(question, 'TH Group Fulfill') > 0);

UPDATE faq_translations SET answer = REPLACE(answer, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(answer, 'TH Group Fulfill') > 0);

UPDATE faq_translations SET question = REPLACE(question, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(question, 'TH Group Fulfill') > 0);

UPDATE faq_translations SET answer = REPLACE(answer, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(answer, 'TH Group Fulfill') > 0);

UPDATE faqs SET question = REPLACE(question, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(question, 'TH Group Fulfill') > 0);

UPDATE faqs SET answer = REPLACE(answer, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(answer, 'TH Group Fulfill') > 0);

UPDATE faqs SET question = REPLACE(question, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(question, 'TH Group Fulfill') > 0);

UPDATE faqs SET answer = REPLACE(answer, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(answer, 'TH Group Fulfill') > 0);

UPDATE faqs SET question = REPLACE(question, 'TH Group Fulfill', 'TH Group')
WHERE id = 3 AND (instr(question, 'TH Group Fulfill') > 0);

UPDATE faqs SET answer = REPLACE(answer, 'TH Group Fulfill', 'TH Group')
WHERE id = 3 AND (instr(answer, 'TH Group Fulfill') > 0);

UPDATE leadership_members SET quote = REPLACE(quote, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(quote, 'TH Group Fulfill') > 0);

UPDATE pages SET title = REPLACE(title, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(title, 'TH Group Fulfill') > 0);

UPDATE pages SET title = REPLACE(title, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(title, 'TH Group Fulfill') > 0);

UPDATE pages SET title = REPLACE(title, 'TH Group Fulfill', 'TH Group')
WHERE id = 3 AND (instr(title, 'TH Group Fulfill') > 0);

UPDATE service_block_translations SET description = REPLACE(description, 'TH Group Fulfill', 'TH Group')
WHERE id = 23 AND (instr(description, 'TH Group Fulfill') > 0);

UPDATE service_block_translations SET description = REPLACE(description, 'TH Group Fulfill', 'TH Group')
WHERE id = 24 AND (instr(description, 'TH Group Fulfill') > 0);

UPDATE service_blocks SET description = REPLACE(description, 'TH Group Fulfill', 'TH Group')
WHERE id = 34 AND (instr(description, 'TH Group Fulfill') > 0);

UPDATE service_blocks SET description = REPLACE(description, 'TH Group Fulfill', 'TH Group')
WHERE id = 35 AND (instr(description, 'TH Group Fulfill') > 0);

UPDATE service_blocks SET description = REPLACE(description, 'TH Group Fulfill', 'TH Group')
WHERE id = 36 AND (instr(description, 'TH Group Fulfill') > 0);

UPDATE shipping_route_translations SET source_snapshot = REPLACE(source_snapshot, 'TH Group Fulfill', 'TH Group')
WHERE id = 19 AND (instr(source_snapshot, 'TH Group Fulfill') > 0);

UPDATE shipping_routes SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE shipping_routes SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE shipping_routes SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 3 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE shipping_routes SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 4 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE shipping_routes SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 5 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE shipping_routes SET body_md = REPLACE(body_md, 'TH Group Fulfill', 'TH Group')
WHERE id = 6 AND (instr(body_md, 'TH Group Fulfill') > 0);

UPDATE site_settings SET brand_name = REPLACE(brand_name, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(brand_name, 'TH Group Fulfill') > 0);

UPDATE site_settings SET terminology_json = REPLACE(terminology_json, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(terminology_json, 'TH Group Fulfill') > 0);

UPDATE testimonial_translations SET quote = REPLACE(quote, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(quote, 'TH Group Fulfill') > 0);

UPDATE testimonial_translations SET quote = REPLACE(quote, 'TH Group Fulfill', 'TH Group')
WHERE id = 5 AND (instr(quote, 'TH Group Fulfill') > 0);

UPDATE testimonials SET quote = REPLACE(quote, 'TH Group Fulfill', 'TH Group')
WHERE id = 1 AND (instr(quote, 'TH Group Fulfill') > 0);

UPDATE testimonials SET quote = REPLACE(quote, 'TH Group Fulfill', 'TH Group')
WHERE id = 2 AND (instr(quote, 'TH Group Fulfill') > 0);

UPDATE testimonials SET quote = REPLACE(quote, 'TH Group Fulfill', 'TH Group')
WHERE id = 3 AND (instr(quote, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'faq.q1' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'faq.q1' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'faq.q1' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'faq.a1' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'faq.a1' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'faq.a1' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_badge' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_badge' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_badge' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_subtitle' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_subtitle' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_subtitle' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_desc' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_desc' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.hero_desc' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'careers.j2_desc' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'footer.copyright' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'footer.copyright' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'footer.copyright' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'order_page.hero_desc' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'order_page.hero_desc' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'order_page.hero_desc' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'testimonials.t1_quote' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'testimonials.t1_quote' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'testimonials.t1_quote' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'about.title_highlight' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'about.title_highlight' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'about.title_highlight' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'about.video_desc' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'about.video_desc' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'about.video_desc' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'op.hero_desc' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'op.hero_desc' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'op.hero_desc' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'op.sol1_d' AND locale = 'en' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'op.sol1_d' AND locale = 'vi' AND (instr(value, 'TH Group Fulfill') > 0);

UPDATE translations SET value = REPLACE(value, 'TH Group Fulfill', 'TH Group')
WHERE key = 'op.sol1_d' AND locale = 'zh' AND (instr(value, 'TH Group Fulfill') > 0);
