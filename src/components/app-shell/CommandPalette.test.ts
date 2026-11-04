import { expect, test } from "bun:test";

test("the users search result targets the registered users page", async () => {
  const source = await Bun.file(new URL("./CommandPalette.tsx", import.meta.url)).text();
  const entry = source.match(/\{\s*to:\s*"([^"]+)"\s*,\s*label:\s*"Người dùng & Phân quyền"/);
  expect(entry?.[1]).toBe("/admin/system/users");

  const route = await Bun.file(
    new URL("../../routes/admin/system/users/index.tsx", import.meta.url),
  ).text();
  expect(route).toContain('createFileRoute("/admin/system/users/")');
});
