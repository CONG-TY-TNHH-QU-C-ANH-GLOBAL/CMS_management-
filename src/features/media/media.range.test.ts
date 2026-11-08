import { describe, expect, test } from "bun:test";

import { parseByteRange } from "./media.range";

describe("parseByteRange", () => {
  const size = 1000;
  test("no or unsupported header serves the whole object", () => {
    expect(parseByteRange(null, size)).toBeUndefined();
    expect(parseByteRange("items=0-1", size)).toBeUndefined();
    expect(parseByteRange("bytes=0-1,5-9", size)).toBeUndefined();
    expect(parseByteRange("bytes=-", size)).toBeUndefined();
  });
  test("closed, open-ended and suffix ranges", () => {
    expect(parseByteRange("bytes=0-99", size)).toEqual({ offset: 0, length: 100 });
    expect(parseByteRange("bytes=900-", size)).toEqual({ offset: 900, length: 100 });
    expect(parseByteRange("bytes=-100", size)).toEqual({ offset: 900, length: 100 });
    expect(parseByteRange("bytes=-5000", size)).toEqual({ offset: 0, length: 1000 });
  });
  test("end past EOF is clamped", () => {
    expect(parseByteRange("bytes=990-5000", size)).toEqual({ offset: 990, length: 10 });
  });
  test("unsatisfiable ranges return null (416)", () => {
    expect(parseByteRange("bytes=1000-", size)).toBeNull();
    expect(parseByteRange("bytes=500-100", size)).toBeNull();
    expect(parseByteRange("bytes=-0", size)).toBeNull();
    expect(parseByteRange("bytes=0-10", 0)).toBeNull();
  });
});
