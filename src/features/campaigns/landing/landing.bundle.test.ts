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

// ── Malformed and hostile archives ──────────────────────────────────────────
// Every case must end in a BundleError with a user-facing message (or, where the platform's
// inflater is the one failing, at least a rejection), never in a partial bundle or a hang.

/** Patch the end-of-central-directory record: [offset in EOCD, byte width, value]. */
function patchEocd(zip: Uint8Array, fields: [number, 2 | 4, number][]): Uint8Array {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  const eocd = out.byteLength - 22;
  for (const [at, width, value] of fields) {
    if (width === 2) view.setUint16(eocd + at, value, true);
    else view.setUint32(eocd + at, value, true);
  }
  return out;
}

describe("readLandingBundle on malformed archives", () => {
  const good = () => makeZip([INDEX, { name: "assets/a.css", data: "a{}" }]);

  test("a CRC mismatch is rejected, stored or deflated", async () => {
    await rejects(makeZip([INDEX, { name: "a.css", data: "a{}", method: 0, crc: 1 }]), /checksum/);
    await rejects(makeZip([INDEX, { name: "a.css", data: "a{}", crc: 0xdeadbeef }]), /checksum/);
  });

  test("empty, tiny and truncated inputs", async () => {
    await rejects(new Uint8Array(0), /rỗng hoặc bị hỏng/);
    await rejects(new Uint8Array(21), /rỗng hoặc bị hỏng/);
    // A valid EOCD with zero entries: a well-formed but empty archive.
    await rejects(makeZip([]), /index\.html/);
    const zip = good();
    // Cut inside the central directory: the EOCD is gone.
    await rejects(zip.subarray(0, zip.byteLength - 30), /không phải \.zip/);
    // Cut the file data but keep a (now lying) directory record at the end.
    const cut = new Uint8Array([...zip.subarray(0, 20), ...zip.subarray(zip.byteLength - 22)]);
    await rejects(cut, /bị hỏng/);
  });

  test("a corrupt central directory is rejected", async () => {
    const zip = good();
    await rejects(patchEocd(zip, [[16, 4, zip.byteLength]]), /Mục lục ZIP bị hỏng/);
    await rejects(
      patchEocd(zip, [
        [10, 2, 5],
        [8, 2, 5],
      ]),
      /Mục lục ZIP bị hỏng/,
    );
    await rejects(patchEocd(zip, [[16, 4, 1]]), /Mục lục ZIP bị hỏng/);
    await rejects(patchEocd(zip, [[4, 2, 1]]), /multi-disk/);
  });

  test("ZIP64 markers and unsupported compression methods fail cleanly", async () => {
    await rejects(
      patchEocd(good(), [
        [10, 2, 0xffff],
        [8, 2, 0xffff],
      ]),
      /ZIP64/,
    );
    await rejects(patchEocd(good(), [[16, 4, 0xffffffff]]), /ZIP64/);
    for (const method of [1, 6, 9, 12, 14, 93, 99]) {
      await rejects(
        makeZip([INDEX, { name: "a.css", data: "a{}", declaredMethod: method }]),
        new RegExp(`method ${method}`),
      );
    }
  });

  test("a local header pointing past the end of the file is rejected", async () => {
    const zip = good();
    const view = new DataView(zip.buffer);
    const cd = view.getUint32(zip.byteLength - 22 + 16, true);
    // Second central entry's local-header offset (46-byte header + 10-byte "index.html" name).
    view.setUint32(cd + 46 + 10 + 42, zip.byteLength - 10, true);
    await rejects(zip, /bị hỏng/);
  });

  test("a corrupt deflate stream rejects instead of yielding a partial bundle", async () => {
    const zip = makeZip([{ name: "index.html", data: "<p>hello hello hello</p>".repeat(40) }]);
    zip.fill(0xff, 30 + 10, 30 + 10 + 24); // garble the start of the deflate body
    // A readable BundleError (the upload route answers 400 with it), never a raw TypeError.
    await rejects(zip, /không giải nén được/);
  });

  test("hostile entry names are rejected before anything is read", async () => {
    await rejects(makeZip([INDEX, { name: "a\u0000.js", data: "x" }]), /ký tự điều khiển/);
    await rejects(
      makeZip([INDEX, { name: "assets/\u001b[31m.css", data: "x" }]),
      /ký tự điều khiển/,
    );
    await rejects(makeZip([INDEX, { name: "\\\\server\\share\\x.js", data: "x" }]), /tuyệt đối/);
    await rejects(makeZip([INDEX, { name: "c:/x.js", data: "x" }]), /tuyệt đối/);
    await rejects(makeZip([INDEX, { name: "./a.js", data: "x" }]), /\.\./);
    await rejects(makeZip([INDEX, { name: "assets//a.js", data: "x" }]), /không hợp lệ/);
    await rejects(makeZip([INDEX, { name: `${"a/".repeat(100)}x.js`, data: "x" }]), /quá dài/);
  });

  test("duplicates are caught exactly and case-insensitively after the top folder is stripped", async () => {
    await rejects(
      makeZip([INDEX, { name: "a.css", data: "1" }, { name: "a.css", data: "2" }]),
      /trùng tên: "a.css"/,
    );
    await rejects(
      makeZip([
        { name: "site/index.html", data: "x" },
        { name: "site/Index.HTML", data: "y" },
      ]),
      /trùng tên/,
    );
  });

  test("symlinks are rejected even inside junk folders or flagged as a directory", async () => {
    await rejects(
      makeZip([INDEX, { name: "__MACOSX/evil.png", data: "/etc/passwd", symlink: true }]),
      /liên kết/,
    );
    await rejects(makeZip([INDEX, { name: "assets/", data: "", symlink: true }]), /liên kết/);
  });

  test("the declared total is capped before any entry is inflated", async () => {
    // 6 × (10 MB − 1) is over the 50 MB cap while each file is under its own 10 MB cap.
    const entries = Array.from({ length: 6 }, (_, i) => ({
      name: `v/${i}.mp4`,
      data: "x",
      method: 0 as const,
      declaredSize: LANDING_LIMITS.fileBytes - 1,
    }));
    await rejects(makeZip([INDEX, ...entries]), /50 MB/);
    expect(LANDING_LIMITS.totalBytes).toBe(50 * 1024 * 1024);
  });

  test("a high-ratio entry is accepted only up to its honest declared size", async () => {
    // 2 MB of zeros deflates to a few KB: legal when declared truthfully ...
    const zeros = new Uint8Array(2 * 1024 * 1024);
    const ok = await readLandingBundle(makeZip([INDEX, { name: "v/a.json", data: zeros }]));
    expect(ok.files.get("v/a.json")?.byteLength).toBe(zeros.byteLength);
    // ... cut off as soon as it inflates past a smaller declared size ...
    await rejects(
      makeZip([INDEX, { name: "v/a.json", data: zeros, declaredSize: 1024 }]),
      /zip bomb/,
    );
    // ... and inflating to LESS than declared is corruption too.
    await rejects(
      makeZip([INDEX, { name: "v/a.json", data: "short", declaredSize: 4096 }]),
      /thiếu dữ liệu/,
    );
  });

  test("Unicode names survive as UTF-8; directory entries and junk are not files", async () => {
    const bundle = await readLandingBundle(
      makeZip([
        INDEX,
        { name: "assets/", data: "" },
        { name: "assets/Ảnh Giáng sinh.png", data: "p" },
        { name: "assets/圣诞.webp", data: "w" },
        { name: "assets/Thumbs.db", data: "junk" },
        { name: "__MACOSX/assets/._x.png", data: "junk" },
      ]),
    );
    expect([...bundle.files.keys()].sort()).toEqual(
      ["assets/Ảnh Giáng sinh.png", "assets/圣诞.webp", "index.html"].sort(),
    );
  });

  test("tens of thousands of skipped entries finish quickly and keep no extra files", async () => {
    const many = Array.from({ length: 20_000 }, (_, i) => ({
      name: `notes/${i}.txt`,
      data: "",
      method: 0 as const,
    }));
    const started = performance.now();
    const bundle = await readLandingBundle(makeZip([INDEX, ...many]));
    expect(performance.now() - started).toBeLessThan(5_000);
    expect([...bundle.files.keys()]).toEqual(["index.html"]);
    // Warnings are capped: the first 50 skipped files plus one summary line with the total.
    expect(bundle.warnings).toHaveLength(51);
    expect(bundle.warnings[0]).toBe("Bỏ qua tệp không thuộc danh sách cho phép: notes/0.txt");
    expect(bundle.warnings[50]).toContain("19950 tệp khác bị bỏ qua (tổng 20000 tệp");
    expect(JSON.stringify(bundle.warnings).length).toBeLessThan(5_000);
  });
});
