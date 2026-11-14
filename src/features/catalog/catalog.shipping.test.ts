import { describe, expect, test } from "bun:test";

import { resolvePriceIncludesShipping } from "./catalog.shipping";

describe("resolvePriceIncludesShipping", () => {
  test("no product flag follows the catalog default", () => {
    expect(resolvePriceIncludesShipping(null, true)).toBe(true);
    expect(resolvePriceIncludesShipping(null, false)).toBe(false);
    expect(resolvePriceIncludesShipping(undefined, true)).toBe(true);
  });

  test("an explicit product flag wins over the default", () => {
    expect(resolvePriceIncludesShipping(0, true)).toBe(false);
    expect(resolvePriceIncludesShipping(1, false)).toBe(true);
  });
});
