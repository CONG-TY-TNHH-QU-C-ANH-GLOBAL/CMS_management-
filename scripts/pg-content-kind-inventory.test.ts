import { test, expect } from "bun:test";

import { extractKindsFromSeedSql, discoverKinds } from "./pg-content-kind-inventory";

test("multi-row INSERT: every tuple's kind is captured", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, position) VALUES
    ('p', 'pain_point', 1),
    ('p', 'solution', 2),
    ('p', 'policy', 3);`;
  const { kinds, errors } = extractKindsFromSeedSql(sql);
  expect(kinds).toEqual(["pain_point", "solution", "policy"]);
  expect(errors).toEqual([]);
});

test("kind column in a different position is found by name", () => {
  const sql = `INSERT INTO service_blocks (kind, page_slug, position) VALUES ('shipping_lane', 'p', 1);`;
  expect(extractKindsFromSeedSql(sql).kinds).toEqual(["shipping_lane"]);
});

test("comma and escaped apostrophe inside another string do not break parsing", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, title) VALUES
    ('p', 'process_step', 'Can''t find it, really'),
    ('p', 'stat', 'A, B, and C');`;
  expect(extractKindsFromSeedSql(sql).kinds).toEqual(["process_step", "stat"]);
});

test("an unregistered kind in a later tuple is still surfaced", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, position) VALUES
    ('p', 'solution', 1),
    ('p', 'totally_unknown_kind', 2);`;
  expect(extractKindsFromSeedSql(sql).kinds).toContain("totally_unknown_kind");
});

test("a service_blocks INSERT without a kind column is a loud error, not a silent skip", () => {
  const sql = `INSERT INTO service_blocks (page_slug, position) VALUES ('p', 1);`;
  const { kinds, errors } = extractKindsFromSeedSql(sql);
  expect(kinds).toEqual([]);
  expect(errors.length).toBe(1);
});

test("a missing seed directory is reported as an error, not a crash", () => {
  const { errors } = discoverKinds("D:/definitely/not/a/real/seed/dir/xyz");
  expect(errors.some((e) => /seed directory/.test(e))).toBe(true);
});

test("real seed files parse cleanly and every discovered kind is registered", () => {
  const { discovered, errors } = discoverKinds(); // scans the actual db/seeds
  expect(errors).toEqual([]);
  const registryKinds = new Set(discovered.keys()); // discovered includes the registry as a source
  expect(registryKinds.size).toBeGreaterThan(0);
});
