import { describe, expect, test } from "bun:test";

import { monthlySourcingResponseSchema } from "./monthly-sourcing.schemas";

describe("monthly sourcing public contract", () => {
  test("exposes only the active year and its rendered month identifiers", () => {
    const payload = {
      year: 2026,
      months: [{ month: 1, title: "Top sản phẩm & nguồn hàng tháng 1/2026", slug: "thang-1-2026" }],
    };
    expect(monthlySourcingResponseSchema.strict().parse(payload)).toEqual(payload);
  });

  test("uses an empty list with a null year before an operator activates a year", () => {
    expect(monthlySourcingResponseSchema.parse({ year: null, months: [] })).toEqual({
      year: null,
      months: [],
    });
  });

  test("rejects an impossible month or a noncanonical LP slug", () => {
    expect(() =>
      monthlySourcingResponseSchema.parse({
        year: 2026,
        months: [{ month: 13, title: "Bad", slug: "thang-13-2026" }],
      }),
    ).toThrow();
    expect(() =>
      monthlySourcingResponseSchema.parse({
        year: 2026,
        months: [{ month: 1, title: "Bad", slug: "thang-01-2026" }],
      }),
    ).toThrow();
  });
});
