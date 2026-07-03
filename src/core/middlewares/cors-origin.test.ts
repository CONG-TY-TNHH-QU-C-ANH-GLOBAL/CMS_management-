import { describe, expect, test } from "bun:test";

import { isLocalhostOrigin } from "./cors-origin";

describe("isLocalhostOrigin", () => {
  test("accepts loopback preview origins with a port", () => {
    expect(isLocalhostOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isLocalhostOrigin("http://localhost:5173")).toBe(true);
    expect(isLocalhostOrigin("https://localhost:8080")).toBe(true);
    expect(isLocalhostOrigin("http://[::1]:3000")).toBe(true);
    expect(isLocalhostOrigin("http://localhost")).toBe(true);
  });

  test("rejects spoof and production origins", () => {
    expect(isLocalhostOrigin("http://localhost.evil.com")).toBe(false);
    expect(isLocalhostOrigin("http://127.0.0.1.evil.com")).toBe(false);
    expect(isLocalhostOrigin("https://thgfulfill.com")).toBe(false);
    expect(isLocalhostOrigin("http://evil.com?localhost")).toBe(false);
    expect(isLocalhostOrigin(null)).toBe(false);
    expect(isLocalhostOrigin("")).toBe(false);
  });
});
