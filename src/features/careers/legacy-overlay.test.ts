import { describe, expect, test } from "bun:test";

import type { CareersJobRow } from "./careers.service";
import { overlayViJobFacts } from "./legacy-overlay";

const legacyZh = {
  slug: "mk-thuc-tap-sinh",
  locale: "zh",
  title: "营销实习生",
  status: "open",
  category: "marketing",
  deadline: null,
  posted_at: 1789100391,
  employment_type: null,
} as unknown as CareersJobRow;

const vi = {
  status: "open" as const,
  category: "marketing",
  deadline: "31/10/2026",
  posted_at: 1788998400,
  employment_type: "Internship",
};

describe("overlayViJobFacts", () => {
  test("fills a null deadline and employment type from the VI source", () => {
    const row = overlayViJobFacts(legacyZh, vi);
    expect(row.deadline).toBe("31/10/2026");
    expect(row.employment_type).toBe("Internship");
    expect(row.posted_at).toBe(1788998400);
    expect(row.title).toBe("营销实习生");
  });

  test("replaces a stale legacy deadline with the VI one", () => {
    const row = overlayViJobFacts({ ...legacyZh, deadline: "15/05/2026" }, vi);
    expect(row.deadline).toBe("31/10/2026");
  });

  test("keeps a localized employment type", () => {
    const row = overlayViJobFacts({ ...legacyZh, employment_type: "3-6 month Internship" }, vi);
    expect(row.employment_type).toBe("3-6 month Internship");
  });

  test("VI owns visibility", () => {
    const row = overlayViJobFacts(legacyZh, { ...vi, status: "closed" });
    expect(row.status).toBe("closed");
  });
});
