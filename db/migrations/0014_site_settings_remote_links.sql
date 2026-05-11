-- 0014: remote_area_links_json on site_settings.
--
-- Previously, EpacketPanel hardcoded 5 Lark Sheet URLs (US Remote, JP/HR/GB/SE
-- zipcodes). Those are operator-edited reference docs — moving them to
-- site_settings lets the operator update/remove without a code deploy.
-- When null/empty, landing hides the section entirely.

ALTER TABLE site_settings ADD COLUMN remote_area_links_json TEXT;

UPDATE site_settings
SET remote_area_links_json = '[
  {"label":"🇺🇸 U.S. Remote Area Price Table","icon":"📊","url":"https://thgfulfill.sg.larksuite.com/sheets/GeOhsIMqrhJ3JztNKVDlfWi9gAe?sheet=Wsz3Aw"},
  {"label":"🇯🇵 Japan (JP) Remote Zipcode","icon":"📮","url":"https://thgfulfill.sg.larksuite.com/sheets/GeOhsIMqrhJ3JztNKVDlfWi9gAe?sheet=rfsGfU"},
  {"label":"🇭🇷 Croatia (HR) Remote Zipcode","icon":"📮","url":"https://thgfulfill.sg.larksuite.com/sheets/GeOhsIMqrhJ3JztNKVDlfWi9gAe?sheet=PQLJFL"},
  {"label":"🇬🇧 Great Britain (GB) Remote Zipcode","icon":"📮","url":"https://thgfulfill.sg.larksuite.com/sheets/GeOhsIMqrhJ3JztNKVDlfWi9gAe?sheet=XzQ2aN"},
  {"label":"🇸🇪 Sweden (SE) Remote Zipcode","icon":"📮","url":"https://thgfulfill.sg.larksuite.com/sheets/GeOhsIMqrhJ3JztNKVDlfWi9gAe?sheet=DqD99A"}
]'
WHERE id = 1;
