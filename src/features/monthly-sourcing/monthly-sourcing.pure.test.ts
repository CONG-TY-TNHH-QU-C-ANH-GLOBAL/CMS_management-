import { describe, expect, test } from "bun:test";

import {
  monthlySourcingSlug,
  parseMonthlySourcingSlug,
} from "./monthly-sourcing.pure";

describe("monthly sourcing URLs", () => {
  test("uses the requested stable LP URL for each month", () => {
    expect(monthlySourcingSlug(2026, 1)).toBe("thang-1-2026");
    expect(monthlySourcingSlug(2026, 12)).toBe("thang-12-2026");
  });

  test("accepts only canonical month routes", () => {
    expect(parseMonthlySourcingSlug("thang-1-2026")).toEqual({ year: 2026, month: 1 });
    expect(parseMonthlySourcingSlug("thang-12-2026")).toEqual({ year: 2026, month: 12 });
    expect(parseMonthlySourcingSlug("thang-0-2026")).toBeNull();
    expect(parseMonthlySourcingSlug("thang-13-2026")).toBeNull();
    expect(parseMonthlySourcingSlug("thang-01-2026")).toBeNull();
    expect(parseMonthlySourcingSlug("christmas-2026")).toBeNull();
  });
});
