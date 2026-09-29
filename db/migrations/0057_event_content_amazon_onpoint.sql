-- Rewrites the two live events whose article body was never laid out.
--
-- thg-x-amazon-trick-or-trend: body_md is the thank-you email pasted as plain
-- text — no Markdown, so it renders as one wall of lines; it still says "trong
-- email này"; "📱 Tham gia Group Zalo" is a button label with no link; and
-- `url` was cut to ".../ed" instead of ".../edit". Content is unchanged,
-- only structured (headings, lists, working links, a blockquote for the AGS
-- sharing notice). The event date stays 31/10/2026 (confirmed by marketing).
--
-- thg-x-onpoint: one sentence and two links. Facts below come from THG's own
-- recap of the event (YouTube q7NiFssAaRE description and the Facebook post it
-- links): offline event on 14/07/2026 at TikTok Office TP.HCM, THG's CEO spoke
-- on logistics, 3PL and returns, THG's team consulted on site. The stored date
-- 2026-09-01 did not match the recap, and "Diễn giả" is the role THG played.
--
-- GUARDED: each UPDATE only fires while the row still holds the old text. If
-- marketing has already rewritten an event in the CMS before this runs, that
-- row is left alone instead of being overwritten.
--
-- SQLite string literals have no escape sequences — the newlines inside the
-- literals below are real newlines, which is what body_md must contain
-- (see 0053). Single quotes are doubled.
--
-- A migration bypasses bumpCmsRev, so after applying it redeploy the landing
-- (or save any content in the CMS) to refresh the prerendered event pages.
-- Neither event has EN/ZH translations yet, so nothing goes stale.

UPDATE events
SET summary         = 'Tài liệu webinar “Trick or Trend – Đọc vị mùa Halloween” do Amazon Global Selling phối hợp cùng THG Fulfill tổ chức, kèm hướng dẫn nhận thưởng mini game.',
    location        = 'Online (webinar)',
    url             = 'https://docs.google.com/presentation/d/1ahGKPJF9N9AmD3ckslks9l2Wu9nqJnhWsHaPbnv4Uvs/edit',
    seo_description = 'Tài liệu webinar Trick or Trend – Đọc vị mùa Halloween 2026 do Amazon Global Selling và THG Fulfill tổ chức: slide trình bày, nhận thưởng mini game, cộng đồng Zalo.',
    body_md         = '## 🎃 Cảm ơn Quý Nhà Bán Hàng

Ban tổ chức chân thành cảm ơn Anh/Chị đã dành thời gian tham dự webinar **“Trick or Trend – Đọc vị mùa Halloween”** do **Amazon Global Selling** phối hợp cùng **THG Fulfill** tổ chức. Rất mong những nội dung chia sẻ sẽ hữu ích cho kế hoạch kinh doanh mùa cao điểm của Anh/Chị.

## 📄 Tài liệu webinar

Để Anh/Chị tiện xem lại, Ban tổ chức gửi kèm tài liệu trình bày của buổi webinar:

- **Slide trình bày:** [Xem tài liệu trên Google Slides](https://docs.google.com/presentation/d/1ahGKPJF9N9AmD3ckslks9l2Wu9nqJnhWsHaPbnv4Uvs/edit)

## 🏆 Nhận thưởng mini game

Phần thưởng của chương trình do team THG Fulfill trực tiếp trao đến người trúng giải. Anh/Chị vui lòng liên hệ THG Fulfill để được hướng dẫn nhận thưởng:

- **Website:** [thgfulfill.com](https://thgfulfill.com)
- **Email:** [sale@thgfulfill.com](mailto:sale@thgfulfill.com)
- **Điện thoại:** [0335.124.089](tel:0335124089)

## 🛍 Câu hỏi về bán hàng trên Amazon

Mọi thắc mắc về việc bán hàng trên Amazon — đăng ký tài khoản, listing, vận hành, ưu đãi dành cho seller mới… — Anh/Chị vui lòng liên hệ trực tiếp đội ngũ **Amazon Global Selling** để được tư vấn cụ thể.

## 📱 Cộng đồng Zalo

Để không bỏ lỡ thông tin mới nhất về event, webinar và các buổi tư vấn, mời Anh/Chị tham gia Group Cộng đồng Zalo của chúng tôi:

[👉 Tham gia Group Cộng đồng Zalo](https://zalo.me/g/axrryk986)

> 🔒 **Lưu ý:** Tài liệu và recording của webinar chỉ dành cho mục đích tham khảo cá nhân của Quý Nhà Bán Hàng. Vui lòng không chia sẻ công khai hoặc cho bên thứ ba khi chưa có sự đồng ý của team Amazon Global Selling (AGS).

---

Hẹn gặp lại Quý Nhà Bán Hàng tại các sự kiện sắp tới của Amazon Global Selling & THG Fulfill.

Trân trọng,

**Ban tổ chức – Amazon Global Selling & THG Fulfill**',
    updated_at      = unixepoch()
WHERE slug = 'thg-x-amazon-trick-or-trend'
  AND locale = 'vi'
  AND instr(body_md, 'Hoặc dán link: https://zalo.me/g/axrryk986') > 0;

UPDATE events
SET title           = 'THG x ONPOINT: Go Global — Bứt phá doanh thu xuyên biên giới',
    summary         = 'THG Fulfill đồng hành cùng OnPoint tại sự kiện offline Go Global ở TikTok Office TP.HCM — CEO THG chia sẻ về logistics, 3PL và quy trình hoàn hàng cho seller bán hàng quốc tế.',
    event_date      = '2026-07-14',
    location        = 'TikTok Office, TP. Hồ Chí Minh',
    role            = 'Diễn giả',
    seo_title       = 'THG x ONPOINT: Go Global tại TikTok Office | THG Fulfill',
    seo_description = 'THG Fulfill đồng hành cùng OnPoint tại sự kiện Go Global ở TikTok Office TP.HCM: chia sẻ về logistics, 3PL và hoàn hàng cho seller TikTok Shop US.',
    body_md         = '## Về sự kiện

Ngày **14/07/2026**, sự kiện offline **GO GLOBAL — Bứt phá doanh thu xuyên biên giới** đã diễn ra tại **TikTok Office TP.HCM**. THG vinh dự được đồng hành cùng **OnPoint**, mang đến những góc nhìn thực chiến cho hành trình Go Global của các thương hiệu Việt trên **TikTok Shop US**.

## THG tại sự kiện

- **CEO THG tham gia với vai trò Speaker**, chia sẻ về bài toán logistics, 3PL và quy trình hoàn hàng tối ưu cho seller quốc tế — một trong những mắt xích sống còn khi vận hành xuyên biên giới.
- **Đội ngũ THG có mặt đông đủ**, trực tiếp hỗ trợ, tư vấn và kết nối với các doanh nghiệp, nhà bán hàng ngay tại sự kiện.

## Chủ đề THG chia sẻ

- **Logistics xuyên biên giới** — đưa hàng từ Việt Nam đến khách hàng quốc tế. Xem thêm: [THG Express](/vi/thg-express)
- **3PL tại Mỹ** — nhận hàng, lưu kho và xử lý đơn tại kho Mỹ. Xem thêm: [THG Warehouse](/vi/thg-warehouse)
- **Quy trình hoàn hàng** — tiếp nhận và xử lý hàng hoàn cho seller bán hàng quốc tế. Xem thêm: [THG Warehouse](/vi/thg-warehouse)

## Xem lại sự kiện

- [Bài recap trên Facebook THG Fulfill](https://www.facebook.com/share/p/1Spw5uMYPT/)
- [Video recap trên kênh YouTube THG Fulfill](https://youtu.be/q7NiFssAaRE)

## Đồng hành cùng THG trên hành trình Go Global

Nếu Anh/Chị đang chuẩn bị đưa sản phẩm ra thị trường quốc tế, đội ngũ THG sẵn sàng tư vấn giải pháp vận chuyển, kho và fulfillment phù hợp. Tìm hiểu thêm tại [THG Fulfill](/vi/thg-fulfill), [THG Express](/vi/thg-express) và [THG Warehouse](/vi/thg-warehouse).',
    updated_at      = unixepoch()
WHERE slug = 'thg-x-onpoint'
  AND locale = 'vi'
  AND instr(body_md, 'Xem lại nội dung sự kiện và các hoạt động hợp tác giữa THG Fulfill và ONPOINT.') > 0;
