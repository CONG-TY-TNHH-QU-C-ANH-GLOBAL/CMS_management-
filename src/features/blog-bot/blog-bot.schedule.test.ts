import { describe, expect, test } from "bun:test";

import { isCampaignDue } from "@/features/blog-bot/blog-bot.schedule";
import type { BlogBotCampaignRow } from "@/features/blog-bot/blog-bot.service";

// Fixed instants (deterministic — no Date.now). Asia/Ho_Chi_Minh = UTC+7.
//   09:00 +07  ==  02:00Z
const AT_0900_VN = Date.UTC(2026, 6, 22, 2, 0, 0); // 2026-07-22 09:00 +07
//   07:00 +07  ==  00:00Z
const AT_0700_VN = Date.UTC(2026, 6, 22, 0, 0, 0); // 2026-07-22 07:00 +07

function campaign(overrides: Partial<BlogBotCampaignRow>): BlogBotCampaignRow {
  return {
    id: 1,
    name: "t",
    enabled: 1,
    run_time: "08:00",
    timezone: "Asia/Ho_Chi_Minh",
    locale: "vi",
    category: null,
    tone: null,
    topic_source: "instruction",
    instruction_md: "x",
    seed_topics_json: null,
    guidelines_md: null,
    image_mode: "none",
    image_style: null,
    autopublish: 0,
    model: "gpt-4o",
    max_per_day: 1,
    last_run_at: null,
    next_run_at: null,
    created_by: 1,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("isCampaignDue", () => {
  test("disabled campaign is never due", () => {
    expect(isCampaignDue(campaign({ enabled: 0 }), AT_0900_VN)).toBe(false);
  });

  test("not due before run_time (local tz)", () => {
    // 07:00 local < 08:00 run_time
    expect(isCampaignDue(campaign({ run_time: "08:00" }), AT_0700_VN)).toBe(false);
  });

  test("due at/after run_time when never run", () => {
    expect(isCampaignDue(campaign({ run_time: "08:00", last_run_at: null }), AT_0900_VN)).toBe(
      true,
    );
  });

  test("not due again if already ran earlier the same local day", () => {
    // last run 08:30 +07 same day == 01:30Z
    const ranToday = Math.floor(Date.UTC(2026, 6, 22, 1, 30, 0) / 1000);
    expect(isCampaignDue(campaign({ last_run_at: ranToday }), AT_0900_VN)).toBe(false);
  });

  test("due again the next day", () => {
    // last run yesterday 09:00 +07 == 2026-07-21 02:00Z
    const ranYesterday = Math.floor(Date.UTC(2026, 6, 21, 2, 0, 0) / 1000);
    expect(isCampaignDue(campaign({ last_run_at: ranYesterday }), AT_0900_VN)).toBe(true);
  });

  test("timezone matters: 09:00Z is still before 08:00 local in a UTC-9 zone", () => {
    // 09:00Z in Pacific/Gambier (UTC-9) is 00:00 local → before 08:00
    const c = campaign({ timezone: "Pacific/Gambier", run_time: "08:00" });
    expect(isCampaignDue(c, Date.UTC(2026, 6, 22, 9, 0, 0))).toBe(false);
  });
});
