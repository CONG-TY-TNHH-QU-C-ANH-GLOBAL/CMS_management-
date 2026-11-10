import { describe, expect, test } from "bun:test";

import { parseProductId } from "./catalog.productId";

describe("parseProductId", () => {
  test("bare Hub id", () => {
    expect(parseProductId("  cmvaoi0av0a4201sciqgwlhpa ")).toBe("cmvaoi0av0a4201sciqgwlhpa");
  });

  test("catalog link from the website, any locale", () => {
    expect(
      parseProductId("https://thgfulfill.com/vi/catalog?productId=cmvaoi0av0a4201sciqgwlhpa"),
    ).toBe("cmvaoi0av0a4201sciqgwlhpa");
    expect(
      parseProductId(
        "https://www.thgfulfill.com/en/catalog?x=1&productId=cmvj0lyc401v801obxylh5mfo#top",
      ),
    ).toBe("cmvj0lyc401v801obxylh5mfo");
  });

  test("rejects text, short ids and links without a product", () => {
    expect(parseProductId("")).toBeNull();
    expect(parseProductId("Hoodie Washed")).toBeNull();
    expect(parseProductId("abc123")).toBeNull();
    expect(parseProductId("https://thgfulfill.com/vi/catalog")).toBeNull();
    expect(parseProductId("https://thgfulfill.com/vi/catalog?productId=../../x")).toBeNull();
  });
});
