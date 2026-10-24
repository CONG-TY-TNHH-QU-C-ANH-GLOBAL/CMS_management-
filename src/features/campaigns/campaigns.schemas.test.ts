import { expect, test } from "bun:test";

import { toPublicCampaign, type PublicCampaignRow } from "./campaigns.pure";
import { campaignResponseSchema, campaignsResponseSchema } from "./campaigns.schemas";

const row: PublicCampaignRow = {
  id: 1,
  slug: "christmas-2026",
  title: "Christmas 2026 Collection",
  summary: "Sản phẩm POD sẵn sàng cho mùa lễ",
  body_md: null,
  cover_media_id: null,
  og_image_id: null,
  start_date: "2026-10-24",
  end_date: "2026-12-25",
  status: "live",
  position: 0,
  landing_path: "/christmas",
  cta_label: "Khám phá bộ sưu tập",
  nav_featured: 1,
  nav_label: "Christmas",
  nav_badge: "NEW",
  home_featured: 1,
  menu_items_json:
    '[{"icon":"🎁","title":"Christmas Collection","subtitle":null,"href":"/catalog/christmas"}]',
  tr_menu_items_json: null,
  seo_title: null,
  seo_description: null,
  updated_at: 1793000000,
};

test("the list DTO satisfies the contract schema exactly (strict keys)", () => {
  const { list } = toPublicCampaign(row, new Map(), "2026-10-24");
  const body = { locale: "vi" as const, campaigns: [list] };
  expect(campaignsResponseSchema.strict().parse(body)).toEqual(body);
  expect(Object.keys(list).sort()).toEqual(
    Object.keys(campaignsResponseSchema.shape.campaigns.element.shape).sort(),
  );
});

test("the detail DTO satisfies the contract schema exactly", () => {
  const { list, detail } = toPublicCampaign(row, new Map(), "2026-10-24");
  const body = {
    campaign: { ...list, ...detail },
    available_locales: ["vi" as const, "en" as const],
  };
  expect(campaignResponseSchema.parse(body)).toEqual(body);
  expect(Object.keys(body.campaign).sort()).toEqual(
    Object.keys(campaignResponseSchema.shape.campaign.shape).sort(),
  );
});
