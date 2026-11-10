import { expect, test } from "bun:test";

import type { CampaignRow } from "@/features/campaigns/campaigns.actions";

import { draftFromRow, draftProblem, draftToPayload } from "./campaign-draft";

const row: CampaignRow = {
  id: 3,
  slug: "tet-2027",
  title: "Tết 2027",
  summary: null,
  body_md: null,
  cover_media_id: null,
  og_image_id: 9,
  start_date: "2027-01-10",
  end_date: null,
  status: "draft",
  position: 2,
  landing_path: "/tet",
  cta_label: null,
  nav_featured: 1,
  nav_label: "Tết",
  nav_badge: null,
  home_featured: 0,
  menu_items_json: '[{"icon":"🧧","title":"Lì xì","subtitle":null,"href":"/tet#hot"}]',
  seo_title: null,
  seo_description: null,
  updated_at: 1,
};

test("row → draft → payload round-trips and clears blanks to null", () => {
  const draft = draftFromRow(row);
  expect(draft.nav_featured).toBe(true);
  expect(draft.menu_items).toEqual([
    {
      icon: "🧧",
      title: "Lì xì",
      subtitle: "",
      href: "/tet#hot",
      card_image_id: null,
      card_image_url: null,
      card_title: "",
      card_text: "",
      card_cta: "",
    },
  ]);
  const payload = draftToPayload(row.id, { ...draft, summary: "  " });
  expect(payload).toMatchObject({
    id: 3,
    title: "Tết 2027",
    summary: null,
    landing_path: "/tet",
    nav_badge: null,
    nav_featured: true,
    home_featured: false,
    og_image_id: 9,
    end_date: null,
    menu_items: [{ icon: "🧧", title: "Lì xì", subtitle: null, href: "/tet#hot", card: null }],
  });
});

test("menu item card: image id + copy round-trip, preview URL stays UI-only", () => {
  const withCard: CampaignRow = {
    ...row,
    menu_items_json: JSON.stringify([
      {
        icon: "🚚",
        title: "Dropship",
        subtitle: null,
        href: "/campaigns/christmas-dropship-2026",
        card: {
          image_media_id: 41,
          title: "Christmas Dropship 2026",
          text: " ",
          cta_label: "Xem ngay",
        },
      },
    ]),
  };
  const draft = draftFromRow(withCard, { 41: "/media/x.jpg" });
  expect(draft.menu_items[0]).toMatchObject({
    card_image_id: 41,
    card_image_url: "/media/x.jpg",
    card_title: "Christmas Dropship 2026",
    card_cta: "Xem ngay",
  });
  const [item] = draftToPayload(row.id, draft).menu_items;
  expect(item.card).toEqual({
    image_media_id: 41,
    title: "Christmas Dropship 2026",
    text: null,
    cta_label: "Xem ngay",
  });
  expect(item).not.toHaveProperty("card_image_url");
  // Clearing every card field stores no card at all.
  const cleared = { ...draft.menu_items[0], card_image_id: null, card_title: "", card_cta: "" };
  expect(draftToPayload(row.id, { ...draft, menu_items: [cleared] }).menu_items[0].card).toBeNull();
});

test("validation: title required, end after start", () => {
  const draft = draftFromRow(row);
  expect(draftProblem(draft)).toBeNull();
  expect(draftProblem({ ...draft, title: " " })).toBe("Tiêu đề bắt buộc.");
  expect(draftProblem({ ...draft, end_date: "2027-01-01" })).toContain("Ngày kết thúc");
});
