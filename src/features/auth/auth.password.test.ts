import { test, expect, describe } from "bun:test";

import {
  MIN_PASSWORD_LENGTH,
  assertPasswordPolicy,
  hashPassword,
  verifyPassword,
} from "./auth.password";

const PASSWORD = "correct horse battery staple";

describe("password hashing", () => {
  test("a hash verifies against the password that produced it", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });

  test("a wrong password does not verify", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword("wrong password entirely", stored)).toBe(false);
  });

  test("verification is case- and whitespace-exact", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD.toUpperCase(), stored)).toBe(false);
    expect(await verifyPassword(` ${PASSWORD}`, stored)).toBe(false);
  });

  test("the same password hashes differently each time (per-hash salt)", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
  });

  test("the stored hash never contains the plaintext", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored).not.toContain(PASSWORD);
    expect(stored.startsWith("pbkdf2$sha256$")).toBe(true);
  });

  test("a malformed or legacy hash reads as a failed login, never a throw", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "pbkdf2$sha256$100000$onlyfourparts",
      "pbkdf2$sha256$abc$c2FsdA==$aGFzaA==",
      "pbkdf2$sha256$0$c2FsdA==$aGFzaA==",
      "bcrypt$sha256$100000$c2FsdA==$aGFzaA==",
      "pbkdf2$sha256$100000$!!!not-base64!!!$aGFzaA==",
      "pbkdf2$sha256$100000$$",
    ]) {
      expect(await verifyPassword(PASSWORD, bad)).toBe(false);
    }
  });
});

describe("password policy", () => {
  test("a password at the minimum length is accepted", () => {
    expect(() => assertPasswordPolicy("x".repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
  });

  test("a password one character short is rejected", () => {
    expect(() => assertPasswordPolicy("x".repeat(MIN_PASSWORD_LENGTH - 1))).toThrow();
  });

  test("an absurdly long password is rejected rather than hashed", () => {
    expect(() => assertPasswordPolicy("x".repeat(5000))).toThrow();
  });
});
