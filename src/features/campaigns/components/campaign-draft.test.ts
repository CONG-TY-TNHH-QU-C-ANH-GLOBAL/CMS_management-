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
    { icon: "🧧", title: "Lì xì", subtitle: "", href: "/tet#hot" },
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
    menu_items: [{ icon: "🧧", title: "Lì xì", subtitle: null, href: "/tet#hot" }],
  });
});

test("validation: title required, end after start", () => {
  const draft = draftFromRow(row);
  expect(draftProblem(draft)).toBeNull();
  expect(draftProblem({ ...draft, title: " " })).toBe("Tiêu đề bắt buộc.");
  expect(draftProblem({ ...draft, end_date: "2027-01-01" })).toContain("Ngày kết thúc");
});
