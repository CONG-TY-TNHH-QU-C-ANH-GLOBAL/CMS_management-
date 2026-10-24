import { describe, expect, test } from "bun:test";

import {
  effectiveFlag,
  isValidCampaignHref,
  mergeMenuItems,
  parseMenuItems,
  toPublicCampaign,
  vnToday,
} from "./campaigns.pure";

describe("vnToday", () => {
  test("rolls over at VN midnight, not UTC midnight", () => {
    // 16:59:59Z = 23:59:59 in Ho Chi Minh City; 17:00:00Z = next day 00:00.
    expect(vnToday(new Date("2026-12-25T16:59:59Z"))).toBe("2026-12-25");
    expect(vnToday(new Date("2026-12-25T17:00:00Z"))).toBe("2026-12-26");
  });
});

describe("effectiveFlag", () => {
  test("off toggle is always false", () => {
    expect(effectiveFlag(0, "live", null, "2026-10-24")).toBe(false);
  });
  test("on + live + no end date is true", () => {
    expect(effectiveFlag(1, "live", null, "2026-10-24")).toBe(true);
    expect(effectiveFlag(true, "live", "", "2026-10-24")).toBe(true);
  });
  test("not live is false", () => {
    expect(effectiveFlag(1, "draft", null, "2026-10-24")).toBe(false);
    expect(effectiveFlag(1, "archived", "2026-12-25", "2026-10-24")).toBe(false);
  });
  test("end_date day itself still counts; the day after does not", () => {
    expect(effectiveFlag(1, "live", "2026-12-25", "2026-12-25")).toBe(true);
    expect(effectiveFlag(1, "live", "2026-12-25", "2026-12-26")).toBe(false);
  });
  test("timezone edge: 23:30 VN on end_date is on, 00:00 VN after is off", () => {
    const end = "2026-12-25";
    expect(effectiveFlag(1, "live", end, vnToday(new Date("2026-12-25T16:30:00Z")))).toBe(true);
    expect(effectiveFlag(1, "live", end, vnToday(new Date("2026-12-25T17:00:00Z")))).toBe(false);
  });
});

describe("parseMenuItems", () => {
  test("bad JSON, non-array and empty input give []", () => {
    expect(parseMenuItems("{not json")).toEqual([]);
    expect(parseMenuItems('{"icon":"x"}')).toEqual([]);
    expect(parseMenuItems(null)).toEqual([]);
    expect(parseMenuItems("")).toEqual([]);
  });
  test("keeps valid items, drops malformed ones, normalises subtitle", () => {
    const items = parseMenuItems(
      JSON.stringify([
        { icon: "🎁", title: "A", subtitle: "sub", href: "/a" },
        { icon: "x", href: "/missing-title" },
        { title: "B", subtitle: "  ", href: "/b" },
      ]),
    );
    expect(items).toEqual([
      { icon: "🎁", title: "A", subtitle: "sub", href: "/a" },
      { icon: "", title: "B", subtitle: null, href: "/b" },
    ]);
  });
});

describe("mergeMenuItems", () => {
  const vi = [
    { icon: "🎁", title: "Bộ sưu tập", subtitle: "Xem tất cả", href: "/a" },
    { icon: "🔥", title: "Bán chạy", subtitle: null, href: "/b" },
  ];
  test("takes translated copy but keeps VI icon and href", () => {
    const en = [{ icon: "?", title: "Collection", subtitle: "See all", href: "/wrong" }];
    expect(mergeMenuItems(vi, en)).toEqual([
      { icon: "🎁", title: "Collection", subtitle: "See all", href: "/a" },
      vi[1],
    ]);
  });
  test("no translation returns the VI menu", () => {
    expect(mergeMenuItems(vi, null)).toBe(vi);
    expect(mergeMenuItems(vi, [])).toBe(vi);
  });
});

describe("isValidCampaignHref", () => {
  test("accepts internal paths and https URLs", () => {
    expect(isValidCampaignHref("/christmas")).toBe(true);
    expect(isValidCampaignHref("/christmas#hot")).toBe(true);
    expect(isValidCampaignHref("https://example.com/x")).toBe(true);
  });
  test("rejects language prefixes, protocol-relative and http", () => {
    expect(isValidCampaignHref("/vi/christmas")).toBe(false);
    expect(isValidCampaignHref("/en")).toBe(false);
    expect(isValidCampaignHref("//evil.com")).toBe(false);
    expect(isValidCampaignHref("http://example.com")).toBe(false);
    expect(isValidCampaignHref("christmas")).toBe(false);
  });
});

describe("toPublicCampaign", () => {
  const row = {
    id: 1,
    slug: "christmas-2026",
    title: "Christmas 2026 Collection",
    summary: "",
    body_md: "## Hi",
    cover_media_id: 7,
    og_image_id: null,
    start_date: "2026-10-24",
    end_date: "2026-12-25",
    status: "live",
    position: 0,
    landing_path: "/christmas",
    cta_label: "Explore Collection",
    nav_featured: 1,
    nav_label: "Christmas",
    nav_badge: "NEW",
    home_featured: 0,
    menu_items_json: '[{"icon":"🎁","title":"A","subtitle":"x","href":"/a"}]',
    tr_menu_items_json: "broken",
    seo_title: null,
    seo_description: null,
    updated_at: 1793000000,
  };
  test("maps media, effective flags and menu; blank strings become null", () => {
    const out = toPublicCampaign(row, new Map([[7, "https://cms/m/7"]]), "2026-10-24");
    expect(out.list.cover_url).toBe("https://cms/m/7");
    expect(out.list.og_image_url).toBeNull();
    expect(out.list.summary).toBeNull();
    expect(out.list.nav_featured).toBe(true);
    expect(out.list.home_featured).toBe(false);
    // A broken translated menu falls back to the VI copy.
    expect(out.list.menu_items).toEqual([{ icon: "🎁", title: "A", subtitle: "x", href: "/a" }]);
    expect(out.detail.body_md).toBe("## Hi");
  });
  test("expired campaign reports both flags off", () => {
    const out = toPublicCampaign({ ...row, home_featured: 1 }, new Map(), "2026-12-26");
    expect(out.list.nav_featured).toBe(false);
    expect(out.list.home_featured).toBe(false);
  });
});
