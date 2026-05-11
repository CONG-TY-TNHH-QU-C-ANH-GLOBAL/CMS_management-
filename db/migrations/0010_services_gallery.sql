-- 0010: extend services with gallery + videos + products JSON columns.
--
-- Replaces hardcoded arrays in THG_landingpage service pages (THGFulfillPage,
-- THGExpressPage, THGWarehousePage, THGOrderPage). All payloads are arbitrary
-- JSON the operator edits via the admin form.
--
-- gallery_json:  JSON array of media URLs OR media_id integers (mixed-mode for
--                seeding from external URLs before migrating to R2).
-- videos_json:   JSON array of `{ youtube_id, caption_key, caption?, thumb? }`.
-- products_json: JSON array of `{ name, price, time, origin, image }` (used
--                only by THG_Fulfill product cards).

ALTER TABLE services ADD COLUMN gallery_json TEXT;
ALTER TABLE services ADD COLUMN videos_json TEXT;
ALTER TABLE services ADD COLUMN products_json TEXT;
