import { describe, expect, test } from "bun:test";

import { CHUNK_PART_BYTES, countParts, isSafeMediaKey, validateParts } from "./media.chunked";

describe("chunked upload helpers", () => {
  test("a 22 MB deck splits into 5 parts, a tiny file into 1", () => {
    expect(countParts(22 * 1024 * 1024)).toBe(5);
    expect(countParts(1)).toBe(1);
    expect(countParts(CHUNK_PART_BYTES)).toBe(1);
    expect(countParts(CHUNK_PART_BYTES + 1)).toBe(2);
  });

  test("only keys shaped like uploadMedia output are accepted", () => {
    expect(isSafeMediaKey("monthly-sourcing/ab12cd34ef-top-san-pham.pdf")).toBe(true);
    for (const bad of ["../etc/passwd", "a/../b-x.pdf", "monthly-sourcing/x.pdf", "/abs/ab-x.pdf", "tag/ab-x", "", 5, null]) {
      expect(isSafeMediaKey(bad)).toBe(false);
    }
  });

  test("parts must be 1..n in order with etags and match the size", () => {
    const size = 22 * 1024 * 1024;
    const ok = [1, 2, 3, 4, 5].map((partNumber) => ({ partNumber, etag: `e${partNumber}` }));
    expect(validateParts(ok, size)).toBe(true);
    expect(validateParts(ok.slice(0, 4), size)).toBe(false);
    expect(validateParts([...ok].reverse(), size)).toBe(false);
    expect(validateParts([{ partNumber: 1, etag: "" }, ...ok.slice(1)], size)).toBe(false);
    expect(validateParts([], size)).toBe(false);
  });
});
