import { describe, expect, test } from "bun:test";

import { computeCostUsd, defaultModelForEntity, MODEL_PRICING } from "./translations.pricing";

describe("computeCostUsd", () => {
  test("gpt-4o-mini: 1M input + 1M output = $0.75", () => {
    expect(computeCostUsd("gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(0.75, 6);
  });

  test("gpt-4o: 1M input + 1M output = $12.50", () => {
    expect(computeCostUsd("gpt-4o", 1_000_000, 1_000_000)).toBeCloseTo(12.5, 6);
  });

  test("typical FAQ call (500 in + 400 out, gpt-4o-mini) ≈ $0.000315", () => {
    const cost = computeCostUsd("gpt-4o-mini", 500, 400);
    // 500*0.15/1M + 400*0.6/1M = 0.0000750 + 0.0002400 = 0.000315
    expect(cost).toBeCloseTo(0.000315, 7);
  });

  test("unknown model returns 0", () => {
    expect(computeCostUsd("gpt-99-overdrive", 1000, 1000)).toBe(0);
  });

  test("zero tokens returns 0", () => {
    expect(computeCostUsd("gpt-4o-mini", 0, 0)).toBe(0);
  });

  test("rounded to micro-USD (6 decimals)", () => {
    const cost = computeCostUsd("gpt-4o-mini", 1, 1);
    // 0.00000015 + 0.0000006 = 0.00000075 → rounds to 0.000001
    const decimals = cost.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(6);
  });
});

describe("defaultModelForEntity", () => {
  test("faq → gpt-4o-mini", () => {
    expect(defaultModelForEntity("faq")).toBe("gpt-4o-mini");
  });
  test("service_block → gpt-4o-mini", () => {
    expect(defaultModelForEntity("service_block")).toBe("gpt-4o-mini");
  });
  test("testimonial → gpt-4o-mini", () => {
    expect(defaultModelForEntity("testimonial")).toBe("gpt-4o-mini");
  });
  test("homepage_block (hero) → gpt-4o", () => {
    expect(defaultModelForEntity("homepage_block")).toBe("gpt-4o");
  });
  test("seo_meta → gpt-4o", () => {
    expect(defaultModelForEntity("seo_meta")).toBe("gpt-4o");
  });
  test("unknown entity falls back to mini", () => {
    expect(defaultModelForEntity("brand_new_thing")).toBe("gpt-4o-mini");
  });
});

describe("MODEL_PRICING table sanity", () => {
  test("every entry has positive rates", () => {
    for (const [model, rate] of Object.entries(MODEL_PRICING)) {
      expect(rate.in_per_mtok).toBeGreaterThan(0);
      expect(rate.out_per_mtok).toBeGreaterThan(0);
      // Output is more expensive than input on every OpenAI model
      expect(rate.out_per_mtok).toBeGreaterThan(rate.in_per_mtok);
      expect(model).toBeTruthy();
    }
  });
});
