-- Company-wide display-name migration: THG -> TH Group.
--
-- Deliberately updates editorial/display copy only. Stable technical contracts
-- such as thgfulfill.com, /thg-* routes, service IDs, storage keys, DB binding
-- names and SKU identifiers remain unchanged.

UPDATE site_settings
SET brand_name = REPLACE(brand_name, 'THG', 'TH Group'),
    terminology_json = REPLACE(terminology_json, 'THG', 'TH Group'),
    updated_at = unixepoch()
WHERE instr(brand_name, 'THG') > 0 OR instr(terminology_json, 'THG') > 0;

UPDATE translations SET value = REPLACE(value, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(value, 'THG') > 0;

UPDATE pages SET
  title = REPLACE(title, 'THG', 'TH Group'),
  meta_description = REPLACE(meta_description, 'THG', 'TH Group'),
  json_ld_blob = REPLACE(json_ld_blob, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(meta_description, 'THG') > 0 OR instr(json_ld_blob, 'THG') > 0;

UPDATE homepage_blocks SET payload_json = REPLACE(payload_json, 'THG', 'TH Group')
WHERE instr(payload_json, 'THG') > 0;
UPDATE homepage_block_translations SET
  payload_json = REPLACE(payload_json, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(payload_json, 'THG') > 0;

UPDATE services_i18n SET
  name = REPLACE(name, 'THG', 'TH Group'),
  tagline = REPLACE(tagline, 'THG', 'TH Group'),
  hero_eyebrow = REPLACE(hero_eyebrow, 'THG', 'TH Group'),
  hero_title = REPLACE(hero_title, 'THG', 'TH Group'),
  hero_sub = REPLACE(hero_sub, 'THG', 'TH Group'),
  cta_text = REPLACE(cta_text, 'THG', 'TH Group'),
  body_md = REPLACE(body_md, 'THG', 'TH Group')
WHERE instr(name, 'THG') > 0 OR instr(tagline, 'THG') > 0 OR instr(hero_eyebrow, 'THG') > 0
   OR instr(hero_title, 'THG') > 0 OR instr(hero_sub, 'THG') > 0
   OR instr(cta_text, 'THG') > 0 OR instr(body_md, 'THG') > 0;
UPDATE service_bullets SET text = REPLACE(text, 'THG', 'TH Group') WHERE instr(text, 'THG') > 0;

UPDATE service_blocks SET
  title = REPLACE(title, 'THG', 'TH Group'),
  description = REPLACE(description, 'THG', 'TH Group'),
  payload_json = REPLACE(payload_json, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(description, 'THG') > 0 OR instr(payload_json, 'THG') > 0;
UPDATE service_block_translations SET
  title = REPLACE(title, 'THG', 'TH Group'),
  description = REPLACE(description, 'THG', 'TH Group'),
  payload_json = REPLACE(payload_json, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(description, 'THG') > 0 OR instr(payload_json, 'THG') > 0;

UPDATE faqs SET
  question = REPLACE(question, 'THG', 'TH Group'), answer = REPLACE(answer, 'THG', 'TH Group')
WHERE instr(question, 'THG') > 0 OR instr(answer, 'THG') > 0;
UPDATE faq_translations SET
  question = REPLACE(question, 'THG', 'TH Group'),
  answer = REPLACE(answer, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(question, 'THG') > 0 OR instr(answer, 'THG') > 0 OR instr(source_snapshot, 'THG') > 0;

UPDATE testimonials SET
  quote = REPLACE(quote, 'THG', 'TH Group'), author_role = REPLACE(author_role, 'THG', 'TH Group')
WHERE instr(quote, 'THG') > 0 OR instr(author_role, 'THG') > 0;
UPDATE testimonial_translations SET
  quote = REPLACE(quote, 'THG', 'TH Group'),
  author_role = REPLACE(author_role, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(quote, 'THG') > 0 OR instr(author_role, 'THG') > 0 OR instr(source_snapshot, 'THG') > 0;

UPDATE contact_locations SET
  label = REPLACE(label, 'THG', 'TH Group'), address = REPLACE(address, 'THG', 'TH Group')
WHERE instr(label, 'THG') > 0 OR instr(address, 'THG') > 0;
UPDATE contact_location_translations SET
  label = REPLACE(label, 'THG', 'TH Group'),
  address = REPLACE(address, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(label, 'THG') > 0 OR instr(address, 'THG') > 0 OR instr(source_snapshot, 'THG') > 0;

UPDATE media SET
  alt_text = REPLACE(alt_text, 'THG', 'TH Group'),
  title = REPLACE(title, 'THG', 'TH Group'),
  tag = REPLACE(tag, 'THG', 'TH Group')
WHERE instr(alt_text, 'THG') > 0 OR instr(title, 'THG') > 0 OR instr(tag, 'THG') > 0;
UPDATE marquee_images SET alt_text = REPLACE(alt_text, 'THG', 'TH Group') WHERE instr(alt_text, 'THG') > 0;

UPDATE blog_posts SET
  title = REPLACE(title, 'THG', 'TH Group'),
  excerpt = REPLACE(excerpt, 'THG', 'TH Group'),
  category = REPLACE(category, 'THG', 'TH Group'),
  seo_title = REPLACE(seo_title, 'THG', 'TH Group'),
  seo_description = REPLACE(seo_description, 'THG', 'TH Group'),
  body_md = REPLACE(body_md, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(excerpt, 'THG') > 0 OR instr(category, 'THG') > 0
   OR instr(seo_title, 'THG') > 0 OR instr(seo_description, 'THG') > 0 OR instr(body_md, 'THG') > 0;
UPDATE blog_post_translations SET
  title = REPLACE(title, 'THG', 'TH Group'),
  excerpt = REPLACE(excerpt, 'THG', 'TH Group'),
  category = REPLACE(category, 'THG', 'TH Group'),
  seo_title = REPLACE(seo_title, 'THG', 'TH Group'),
  seo_description = REPLACE(seo_description, 'THG', 'TH Group'),
  body_md = REPLACE(body_md, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(excerpt, 'THG') > 0 OR instr(category, 'THG') > 0
   OR instr(seo_title, 'THG') > 0 OR instr(seo_description, 'THG') > 0
   OR instr(body_md, 'THG') > 0 OR instr(source_snapshot, 'THG') > 0;
UPDATE blog_slides SET alt_text = REPLACE(alt_text, 'THG', 'TH Group') WHERE instr(alt_text, 'THG') > 0;

UPDATE policies SET
  title = REPLACE(title, 'THG', 'TH Group'),
  body_md = REPLACE(body_md, 'THG', 'TH Group'),
  summary = REPLACE(summary, 'THG', 'TH Group'),
  text_blocks_json = REPLACE(text_blocks_json, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(body_md, 'THG') > 0
   OR instr(summary, 'THG') > 0 OR instr(text_blocks_json, 'THG') > 0;
UPDATE policy_translations SET
  title = REPLACE(title, 'THG', 'TH Group'),
  body_md = REPLACE(body_md, 'THG', 'TH Group'),
  summary = REPLACE(summary, 'THG', 'TH Group'),
  text_blocks_json = REPLACE(text_blocks_json, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(body_md, 'THG') > 0 OR instr(summary, 'THG') > 0
   OR instr(text_blocks_json, 'THG') > 0 OR instr(source_snapshot, 'THG') > 0;

UPDATE careers_jobs SET
  title = REPLACE(title, 'THG', 'TH Group'), body_md = REPLACE(body_md, 'THG', 'TH Group'),
  category = REPLACE(category, 'THG', 'TH Group'), badge = REPLACE(badge, 'THG', 'TH Group'),
  tagline = REPLACE(tagline, 'THG', 'TH Group'), salary_note = REPLACE(salary_note, 'THG', 'TH Group'),
  experience = REPLACE(experience, 'THG', 'TH Group'), lead = REPLACE(lead, 'THG', 'TH Group'),
  responsibilities_json = REPLACE(responsibilities_json, 'THG', 'TH Group'),
  requirements_json = REPLACE(requirements_json, 'THG', 'TH Group'),
  benefits_json = REPLACE(benefits_json, 'THG', 'TH Group'),
  bonuses_json = REPLACE(bonuses_json, 'THG', 'TH Group')
WHERE instr(title, 'THG') > 0 OR instr(body_md, 'THG') > 0 OR instr(category, 'THG') > 0
   OR instr(badge, 'THG') > 0 OR instr(tagline, 'THG') > 0 OR instr(salary_note, 'THG') > 0
   OR instr(experience, 'THG') > 0 OR instr(lead, 'THG') > 0
   OR instr(responsibilities_json, 'THG') > 0 OR instr(requirements_json, 'THG') > 0
   OR instr(benefits_json, 'THG') > 0 OR instr(bonuses_json, 'THG') > 0;
UPDATE careers_job_translations SET
  title = REPLACE(title, 'THG', 'TH Group'), body_md = REPLACE(body_md, 'THG', 'TH Group'),
  tagline = REPLACE(tagline, 'THG', 'TH Group'), salary_note = REPLACE(salary_note, 'THG', 'TH Group'),
  experience = REPLACE(experience, 'THG', 'TH Group'), lead = REPLACE(lead, 'THG', 'TH Group'),
  responsibilities_json = REPLACE(responsibilities_json, 'THG', 'TH Group'),
  requirements_json = REPLACE(requirements_json, 'THG', 'TH Group'),
  benefits_json = REPLACE(benefits_json, 'THG', 'TH Group'),
  bonuses_json = REPLACE(bonuses_json, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(body_md, 'THG') > 0 OR instr(tagline, 'THG') > 0
   OR instr(salary_note, 'THG') > 0 OR instr(experience, 'THG') > 0 OR instr(lead, 'THG') > 0
   OR instr(responsibilities_json, 'THG') > 0 OR instr(requirements_json, 'THG') > 0
   OR instr(benefits_json, 'THG') > 0 OR instr(bonuses_json, 'THG') > 0
   OR instr(source_snapshot, 'THG') > 0;

UPDATE shipping_routes SET
  title = REPLACE(title, 'THG', 'TH Group'), body_md = REPLACE(body_md, 'THG', 'TH Group'),
  notes_json = REPLACE(notes_json, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(body_md, 'THG') > 0 OR instr(notes_json, 'THG') > 0;
UPDATE shipping_route_translations SET
  title = REPLACE(title, 'THG', 'TH Group'), body_md = REPLACE(body_md, 'THG', 'TH Group'),
  notes_json = REPLACE(notes_json, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(body_md, 'THG') > 0
   OR instr(notes_json, 'THG') > 0 OR instr(source_snapshot, 'THG') > 0;
UPDATE shipping_route_tables SET
  caption = REPLACE(caption, 'THG', 'TH Group'),
  columns_json = REPLACE(columns_json, 'THG', 'TH Group'),
  rows_json = REPLACE(rows_json, 'THG', 'TH Group')
WHERE instr(caption, 'THG') > 0 OR instr(columns_json, 'THG') > 0 OR instr(rows_json, 'THG') > 0;

UPDATE pricing_tables SET
  name = REPLACE(name, 'THG', 'TH Group'),
  description = REPLACE(description, 'THG', 'TH Group'),
  schema_json = REPLACE(schema_json, 'THG', 'TH Group'),
  data_json = REPLACE(data_json, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(name, 'THG') > 0 OR instr(description, 'THG') > 0
   OR instr(schema_json, 'THG') > 0 OR instr(data_json, 'THG') > 0;

UPDATE glossary SET
  term_vi = REPLACE(term_vi, 'THG', 'TH Group'),
  term_en = REPLACE(term_en, 'THG', 'TH Group'),
  term_zh = REPLACE(term_zh, 'THG', 'TH Group'),
  notes = REPLACE(notes, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(term_vi, 'THG') > 0 OR instr(term_en, 'THG') > 0
   OR instr(term_zh, 'THG') > 0 OR instr(notes, 'THG') > 0;

UPDATE community_categories SET name = REPLACE(name, 'THG', 'TH Group') WHERE instr(name, 'THG') > 0;
UPDATE community_questions SET
  title = REPLACE(title, 'THG', 'TH Group'), body = REPLACE(body, 'THG', 'TH Group'),
  expert_answer = REPLACE(expert_answer, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(body, 'THG') > 0 OR instr(expert_answer, 'THG') > 0;
UPDATE community_reviews SET
  title = REPLACE(title, 'THG', 'TH Group'), body = REPLACE(body, 'THG', 'TH Group'),
  public_summary = REPLACE(public_summary, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(body, 'THG') > 0 OR instr(public_summary, 'THG') > 0;

UPDATE partners SET
  name = REPLACE(name, 'THG', 'TH Group'), tier = REPLACE(tier, 'THG', 'TH Group'),
  updated_at = unixepoch()
WHERE instr(name, 'THG') > 0 OR instr(tier, 'THG') > 0;
UPDATE leadership_members SET
  name = REPLACE(name, 'THG', 'TH Group'), role = REPLACE(role, 'THG', 'TH Group'),
  quote = REPLACE(quote, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(name, 'THG') > 0 OR instr(role, 'THG') > 0 OR instr(quote, 'THG') > 0;

UPDATE events SET
  title = REPLACE(title, 'THG', 'TH Group'), summary = REPLACE(summary, 'THG', 'TH Group'),
  body_md = REPLACE(body_md, 'THG', 'TH Group'), location = REPLACE(location, 'THG', 'TH Group'),
  role = REPLACE(role, 'THG', 'TH Group'), seo_title = REPLACE(seo_title, 'THG', 'TH Group'),
  seo_description = REPLACE(seo_description, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(summary, 'THG') > 0 OR instr(body_md, 'THG') > 0
   OR instr(location, 'THG') > 0 OR instr(role, 'THG') > 0 OR instr(seo_title, 'THG') > 0
   OR instr(seo_description, 'THG') > 0;
UPDATE event_translations SET
  title = REPLACE(title, 'THG', 'TH Group'), summary = REPLACE(summary, 'THG', 'TH Group'),
  body_md = REPLACE(body_md, 'THG', 'TH Group'), location = REPLACE(location, 'THG', 'TH Group'),
  role = REPLACE(role, 'THG', 'TH Group'), seo_title = REPLACE(seo_title, 'THG', 'TH Group'),
  seo_description = REPLACE(seo_description, 'THG', 'TH Group'),
  source_snapshot = REPLACE(source_snapshot, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(title, 'THG') > 0 OR instr(summary, 'THG') > 0 OR instr(body_md, 'THG') > 0
   OR instr(location, 'THG') > 0 OR instr(role, 'THG') > 0 OR instr(seo_title, 'THG') > 0
   OR instr(seo_description, 'THG') > 0 OR instr(source_snapshot, 'THG') > 0;
UPDATE event_photos SET caption = REPLACE(caption, 'THG', 'TH Group') WHERE instr(caption, 'THG') > 0;

UPDATE cta_blocks SET label = REPLACE(label, 'THG', 'TH Group') WHERE instr(label, 'THG') > 0;
UPDATE blog_bot_campaigns SET
  name = REPLACE(name, 'THG', 'TH Group'), tone = REPLACE(tone, 'THG', 'TH Group'),
  instruction_md = REPLACE(instruction_md, 'THG', 'TH Group'),
  seed_topics_json = REPLACE(seed_topics_json, 'THG', 'TH Group'),
  guidelines_md = REPLACE(guidelines_md, 'THG', 'TH Group'),
  image_style = REPLACE(image_style, 'THG', 'TH Group'), updated_at = unixepoch()
WHERE instr(name, 'THG') > 0 OR instr(tone, 'THG') > 0 OR instr(instruction_md, 'THG') > 0
   OR instr(seed_topics_json, 'THG') > 0 OR instr(guidelines_md, 'THG') > 0
   OR instr(image_style, 'THG') > 0;
