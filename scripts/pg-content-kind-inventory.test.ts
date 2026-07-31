import { test, expect } from "bun:test";

import { extractKindsFromSeedSql } from "./pg-content-kind-inventory-parser";
import { discoverKinds } from "./pg-content-kind-inventory";

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

test("quoted comma and doubled apostrophe inside a string do not break parsing", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, title) VALUES
    ('p', 'process_step', 'Can''t find it, really'),
    ('p', 'stat', 'A, B, and C');`;
  expect(extractKindsFromSeedSql(sql).kinds).toEqual(["process_step", "stat"]);
});

test("parentheses inside a string do not terminate the tuple", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, title) VALUES ('p', 'policy', 'Refund (partial) allowed');`;
  expect(extractKindsFromSeedSql(sql).kinds).toEqual(["policy"]);
});

test("a nested function expression outside a string is handled (depth tracking)", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, position, created_at) VALUES ('p', 'solution', 1, coalesce(now(), now()));`;
  expect(extractKindsFromSeedSql(sql).kinds).toEqual(["solution"]);
});

test("payload JSON containing parentheses is not mis-split", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, payload_json) VALUES ('p', 'resource', '{"note":"see (a) and (b)"}');`;
  expect(extractKindsFromSeedSql(sql).kinds).toEqual(["resource"]);
});

test("ON CONFLICT after VALUES is not scanned as a tuple", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, position) VALUES ('p', 'stat', 1)
    ON CONFLICT (page_slug, kind, position) DO NOTHING;`;
  const { kinds, errors } = extractKindsFromSeedSql(sql);
  expect(kinds).toEqual(["stat"]);
  expect(errors).toEqual([]);
});

test("RETURNING after VALUES is not scanned as a tuple", () => {
  const sql = `INSERT INTO service_blocks (page_slug, kind, position) VALUES ('p', 'policy', 1) RETURNING id;`;
  const { kinds, errors } = extractKindsFromSeedSql(sql);
  expect(kinds).toEqual(["policy"]);
  expect(errors).toEqual([]);
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
  expect(errors).toHaveLength(1);
});

test("a missing seed directory is reported as an error, not a crash", () => {
  const { errors } = discoverKinds("D:/definitely/not/a/real/seed/dir/xyz");
  expect(errors.some((e) => /seed directory/.test(e))).toBe(true);
});

test("real seed files parse cleanly and every discovered kind is registered", () => {
  const { discovered, errors } = discoverKinds(); // scans the actual db/seeds
  expect(errors).toEqual([]);
  expect(discovered.size).toBeGreaterThan(0);
});
