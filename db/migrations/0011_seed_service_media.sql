-- 0011: seed services.gallery_json / videos_json / products_json from the
-- hardcoded arrays previously living in THG_landingpage service pages.
--
-- Source: THGFulfillPage.tsx (products[3], sliderImages[9]),
--         THGExpressPage.tsx (galleryImages[6]),
--         THGWarehousePage.tsx (sliderImages[8]),
--         THGOrderPage.tsx (videos[3]).
--
-- Image URLs point to the existing ladicdn.com host. Operator can later
-- re-upload to R2 via Media Library and swap each url for a media_id.
-- This seed pre-populates D1 so landing fetches non-empty data immediately
-- after migration, and the admin editor displays existing images.

UPDATE services SET products_json = '[
  {"name":"Hawaiian Shirt","price":"$10.83","time":"3 - 5 days","origin":"Việt Nam 🇻🇳","image":"https://w.ladicdn.com/s600x600/67e69e24e8a7ba001127c80a/post-bai-3-2-20250904045611-nsqtt.png"},
  {"name":"Jersey Thêu","price":"$34.00","time":"5 - 10 days","origin":"Trung Quốc 🇨🇳","image":"https://w.ladicdn.com/s600x600/67e69e24e8a7ba001127c80a/7-20250903095516-2lcoo.png"},
  {"name":"Phonecase","price":"$6.00","time":"1 - 2 days","origin":"USA 🇺🇸","image":"https://w.ladicdn.com/s600x600/67e69e24e8a7ba001127c80a/1-20250904045247-dyrmm.png"}
]'
WHERE id = 'thg-fulfill';

UPDATE services SET gallery_json = '[
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-10-1-20250729095528-mkcfd.jpg","alt":"Kho US 1"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-11-1-20250729095528-nzruq.jpg","alt":"Kho US 2"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-14-1-20250729095528-dcsxm.jpg","alt":"Kho US 3"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/1-20250724024641-4oczs.png","alt":"Kho US 4"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-13-20250724024632-bt6u-.jpg","alt":"Kho US 5"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_9873-20250801074610-q-tfu.jpg","alt":"Kho US 6"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_9988-20250801074609-jjvij.jpg","alt":"Kho US 7"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/retouch_2025072518361201-20250801074608-tsi9a.jpg","alt":"Kho US 8"},
  {"url":"https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_7181-20250801190217-bvrod.jpg","alt":"Kho US 9"}
]'
WHERE id = 'thg-fulfill';

-- THG_Order videos (4 YouTube IDs from THGOrderPage.tsx:112-115 — one was duplicated; we keep distinct ones)
UPDATE services SET videos_json = '[
  {"youtube_id":"KPhQYnkYA68","caption_key":"op.vid1_cap"},
  {"youtube_id":"ZgoqBsujyC0","caption_key":"op.vid2_cap"}
]'
WHERE id = 'thg-order';
