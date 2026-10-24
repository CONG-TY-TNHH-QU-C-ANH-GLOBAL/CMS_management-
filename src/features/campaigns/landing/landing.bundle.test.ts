import { describe, expect, test } from "bun:test";

import { makeZip } from "./__fixtures__/make-zip";
import { BundleError, LANDING_LIMITS, readLandingBundle, safeRelativePath } from "./landing.bundle";

const INDEX = { name: "index.html", data: "<!doctype html><title>x</title>" };
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

async function rejects(zip: Uint8Array, pattern: RegExp) {
  const error = await readLandingBundle(zip).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BundleError);
  expect((error as Error).message).toMatch(pattern);
}

describe("readLandingBundle", () => {
  test("reads deflated and stored entries with their content", async () => {
    const bundle = await readLandingBundle(
      makeZip([
        INDEX,
        { name: "assets/app.css", data: "body{color:red}", method: 0 },
        { name: "assets/img/hero.jpg", data: new Uint8Array([1, 2, 3, 4]) },
      ]),
    );
    expect([...bundle.files.keys()].sort()).toEqual([
      "assets/app.css",
      "assets/img/hero.jpg",
      "index.html",
    ]);
    expect(text(bundle.files.get("assets/app.css"))).toBe("body{color:red}");
    expect(bundle.totalBytes).toBe(31 + 15 + 4);
  });

  test("strips a single top folder that holds index.html", async () => {
    const bundle = await readLandingBundle(
      makeZip([
        { name: "xmas-landing/index.html", data: "<p>hi</p>" },
        { name: "xmas-landing/assets/a.png", data: "png" },
      ]),
    );
    expect([...bundle.files.keys()].sort()).toEqual(["assets/a.png", "index.html"]);
    expect(bundle.warnings.join(" ")).toContain('Đã bỏ thư mục gốc "xmas-landing/"');
  });

  test("requires index.html at the root or inside exactly one top folder", async () => {
    await rejects(makeZip([{ name: "page.html", data: "x" }]), /index\.html/);
    await rejects(
      makeZip([
        { name: "a/index.html", data: "x" },
        { name: "b/index.html", data: "y" },
      ]),
      /index\.html/,
    );
    await rejects(makeZip([{ name: "a/b/index.html", data: "x" }]), /index\.html/);
  });

  test("rejects path traversal, absolute paths and symlinks", async () => {
    await rejects(makeZip([INDEX, { name: "../evil.js", data: "x" }]), /\.\./);
    await rejects(makeZip([INDEX, { name: "assets/../../evil.js", data: "x" }]), /\.\./);
    await rejects(makeZip([INDEX, { name: "/etc/passwd.js", data: "x" }]), /tuyệt đối/);
    await rejects(makeZip([INDEX, { name: "C:\\win\\x.js", data: "x" }]), /tuyệt đối/);
    await rejects(makeZip([INDEX, { name: "assets\\..\\..\\x.js", data: "x" }]), /\.\./);
    await rejects(
      makeZip([INDEX, { name: "assets/link.png", data: "/etc", symlink: true }]),
      /liên kết/,
    );
  });

  test("folds Windows backslash separators into a normal path", async () => {
    const bundle = await readLandingBundle(
      makeZip([INDEX, { name: "assets\\hero.jpg", data: "j" }]),
    );
    expect(bundle.files.has("assets/hero.jpg")).toBe(true);
    expect(safeRelativePath("assets\\img\\a.png")).toBe("assets/img/a.png");
  });

  test("rejects server-side files and skips other non-allow-listed files", async () => {
    for (const name of ["api.php", "assets/run.sh", ".htaccess", "cgi/x.py", "a/.env"]) {
      await rejects(makeZip([INDEX, { name, data: "x" }]), /máy chủ/);
    }
    const bundle = await readLandingBundle(
      makeZip([
        INDEX,
        { name: "README.md", data: "notes" },
        { name: "__MACOSX/._index.html", data: "junk" },
        { name: "assets/.DS_Store", data: "junk" },
        { name: "assets/font.woff2", data: "f" },
      ]),
    );
    expect([...bundle.files.keys()].sort()).toEqual(["assets/font.woff2", "index.html"]);
    expect(bundle.warnings).toEqual(["Bỏ qua tệp không thuộc danh sách cho phép: README.md"]);
  });

  test("enforces the zip, per-file and file-count caps", async () => {
    await rejects(new Uint8Array(LANDING_LIMITS.zipBytes + 1), /25 MB/);
    await rejects(
      makeZip([
        INDEX,
        { name: "big.mp4", data: "x", method: 0, declaredSize: LANDING_LIMITS.fileBytes + 1 },
      ]),
      /10 MB/,
    );
    const many = Array.from({ length: LANDING_LIMITS.files }, (_, i) => ({
      name: `assets/${i}.png`,
      data: "p",
    }));
    await rejects(makeZip([INDEX, ...many]), /vượt giới hạn 300/);
    const atLimit = await readLandingBundle(makeZip([INDEX, ...many.slice(1)]));
    expect(atLimit.files.size).toBe(LANDING_LIMITS.files);
  });

  test("rejects a deflate entry that inflates past its declared size (zip bomb)", async () => {
    await rejects(
      makeZip([INDEX, { name: "assets/a.js", data: "a".repeat(5000), declaredSize: 100 }]),
      /zip bomb/,
    );
  });

  test("rejects encrypted entries, duplicates and non-zip input", async () => {
    await rejects(makeZip([INDEX, { name: "a.js", data: "x", encrypted: true }]), /mật khẩu/);
    await rejects(
      makeZip([INDEX, { name: "A.JS", data: "1" }, { name: "a.js", data: "2" }]),
      /trùng/,
    );
    await rejects(new TextEncoder().encode("<html>not a zip</html>"), /không phải \.zip/);
  });
});
