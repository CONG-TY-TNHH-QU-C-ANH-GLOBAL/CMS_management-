-- Cover images remain optional. Upload the original event photography through
-- CMS media, then set cover_media_id. A recording thumbnail is used only for
-- an event that actually supplied a recording URL.
ALTER TABLE events ADD COLUMN video_url TEXT;

INSERT INTO events (slug, locale, title, summary, body_md, event_date, role, url, video_url, status, seo_title, seo_description, updated_at)
VALUES
('thg-x-onpoint', 'vi', 'THG x ONPOINT', 'Câu chuyện hợp tác và vận hành cùng ONPOINT.',
'## THG x ONPOINT\n\nXem lại nội dung sự kiện và các hoạt động hợp tác giữa THG Fulfill và ONPOINT.\n\n- [Xem bài viết trên Facebook](https://www.facebook.com/share/p/1Spw5uMYPT/)\n- [Xem video sự kiện trên YouTube](https://youtu.be/q7NiFssAaRE)',
'2026-09-01', 'Sự kiện đối tác', 'https://www.facebook.com/share/p/1Spw5uMYPT/', 'https://youtu.be/q7NiFssAaRE', 'live', 'THG x ONPOINT | THG Fulfill', 'Sự kiện hợp tác giữa THG Fulfill và ONPOINT.', unixepoch()),
('thg-x-amazon-trick-or-trend', 'vi', 'THG x Amazon — Trick or Trend', 'Tài liệu webinar mùa Halloween 2026 cùng Amazon Global Selling.',
'## Cảm ơn Quý Nhà Bán Hàng\n\n### TRICK OR TREND — Đọc vị mùa Halloween\n\nBan tổ chức chân thành cảm ơn Anh/Chị đã tham dự webinar do **Amazon Global Selling** phối hợp cùng **THG Fulfill** tổ chức. Rất mong những nội dung chia sẻ sẽ hữu ích cho kế hoạch kinh doanh mùa cao điểm.\n\n- [Tài liệu trình bày](https://docs.google.com/presentation/d/1ahGKPJF9N9AmD3ckslks9l2Wu9nqJnhWsHaPbnv4Uvs/ed)\n\nLink recording sẽ được cập nhật khi Ban tổ chức phát hành.\n\n### Về phần thưởng mini game\n\nPhần thưởng do team THG Fulfill trực tiếp trao đến người trúng giải. Liên hệ **THG Fulfill**: [thgfulfill.com](https://thgfulfill.com) · [sale@thgfulfill.com](mailto:sale@thgfulfill.com) · 0335.124.089.\n\n### Về việc bán hàng trên Amazon\n\nVới các câu hỏi về tài khoản, listing, vận hành và ưu đãi seller mới, vui lòng liên hệ đội ngũ Amazon Global Selling.\n\n[Tham gia Group Cộng đồng Zalo](https://zalo.me/g/axrryk986) để cập nhật event, webinar và các buổi tư vấn.\n\n> Tài liệu và recording chỉ dành cho mục đích tham khảo cá nhân; vui lòng không chia sẻ công khai hoặc cho bên thứ ba khi chưa có sự đồng ý từ Amazon Global Selling.\n\nHẹn gặp lại Anh/Chị tại các sự kiện sắp tới của Amazon Global Selling & THG Fulfill.',
'2026-10-31', 'Đồng tổ chức webinar', 'https://docs.google.com/presentation/d/1ahGKPJF9N9AmD3ckslks9l2Wu9nqJnhWsHaPbnv4Uvs/ed', NULL, 'live', 'THG x Amazon: Trick or Trend | THG Fulfill', 'Tài liệu webinar Trick or Trend mùa Halloween 2026.', unixepoch());
