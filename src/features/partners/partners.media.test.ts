import { describe, expect, test } from "bun:test";

import { toMediaUrl } from "./partners.media";

const ORIGIN = "https://cms.thgfulfill.com";

describe("toMediaUrl", () => {
  test("absent logo stays absent", () => {
    expect(toMediaUrl(null, ORIGIN)).toBeNull();
    expect(toMediaUrl(undefined, ORIGIN)).toBeNull();
    expect(toMediaUrl("", ORIGIN)).toBeNull();
    expect(toMediaUrl("   ", ORIGIN)).toBeNull();
  });

  test("an R2 key becomes an absolute proxy URL", () => {
    expect(toMediaUrl("partners/abc123-tiktok.png", ORIGIN)).toBe(
      "https://cms.thgfulfill.com/api/v1/media/partners%2Fabc123-tiktok.png",
    );
  });

  test("slashes are percent-encoded — the proxy reads the key as one segment", () => {
    // Matches the shape production already serves for blog thumbnails:
    // .../api/v1/media/blog-bot%2Fpgust4lpes-blog-bot.jpg
    const out = toMediaUrl("blog-bot/pgust4lpes-blog-bot.jpg", ORIGIN);
    expect(out).toContain("%2F");
    expect(out).not.toContain("media/blog-bot/");
  });

  test("an already-absolute URL passes through unchanged", () => {
    const external = "https://cdn.example.com/logos/onpoint.svg?v=2";
    expect(toMediaUrl(external, ORIGIN)).toBe(external);
    expect(toMediaUrl("http://legacy.example.com/a.png", ORIGIN)).toBe(
      "http://legacy.example.com/a.png",
    );
  });

  test("protocol match is case-insensitive", () => {
    expect(toMediaUrl("HTTPS://cdn.example.com/x.png", ORIGIN)).toBe(
      "HTTPS://cdn.example.com/x.png",
    );
  });

  test("origin is honoured so a preview deployment serves preview URLs", () => {
    expect(toMediaUrl("partners/x.png", "https://preview.example.workers.dev")).toBe(
      "https://preview.example.workers.dev/api/v1/media/partners%2Fx.png",
    );
  });

  test("a key with spaces or unicode is encoded, not emitted raw", () => {
    const out = toMediaUrl("partners/logo đối tác.png", ORIGIN)!;
    expect(out).not.toContain(" ");
    expect(new URL(out).pathname.startsWith("/api/v1/media/")).toBe(true);
  });
});
