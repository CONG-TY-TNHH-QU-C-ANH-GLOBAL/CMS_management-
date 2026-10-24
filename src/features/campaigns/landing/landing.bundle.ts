// Upload validation: turns a .zip into a vetted set of static files, or a
// Vietnamese error the editor can show as-is.
//
// The uploaded HTML runs arbitrary scripts on lp.thgfulfill.com, so the
// boundary that matters is the HOST (see landing.host.ts). This module keeps
// the bundle itself boring: static files only, sane sizes, no path tricks.

import { listZipEntries, readZipEntry, ZipError, type ZipEntry } from "./landing.zip";

export const LANDING_LIMITS = {
  zipBytes: 25 * 1024 * 1024,
  files: 300,
  fileBytes: 10 * 1024 * 1024,
  /** Sum of uncompressed sizes. Bounds memory even when every file is under the per-file cap. */
  totalBytes: 100 * 1024 * 1024,
  pathLength: 200,
} as const;

export const ALLOWED_EXTENSIONS = new Set([
  "html",
  "css",
  "js",
  "json",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "svg",
  "avif",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "mp4",
  "webm",
]);

/** Server-side / executable files: the upload is REJECTED, not just filtered, because their
 *  presence means the bundle is not what marketing thinks it is. */
const SERVER_SIDE = new Set([
  "php",
  "phtml",
  "php3",
  "php4",
  "php5",
  "phar",
  "asp",
  "aspx",
  "ashx",
  "jsp",
  "jspx",
  "cgi",
  "pl",
  "py",
  "rb",
  "sh",
  "bash",
  "bat",
  "cmd",
  "ps1",
  "exe",
  "dll",
  "so",
  "wasm",
  "htaccess",
  "htpasswd",
  "env",
  "ini",
  "config",
  "shtml",
]);

/** OS / archiver noise, dropped silently. */
const JUNK = [/^__MACOSX\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/i, /(^|\/)desktop\.ini$/i];

export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleError";
  }
}

export interface LandingBundle {
  /** Normalized relative path → bytes. Always contains "index.html". */
  files: Map<string, Uint8Array>;
  totalBytes: number;
  /** Non-fatal notes (skipped files, stripped folder) for the report. */
  warnings: string[];
}

export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  // ".htaccess" has no name before the dot: treat the whole thing as the extension.
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** Normalize an entry name to a safe relative path, or throw. Backslashes are folded to "/"
 *  first because Windows PowerShell's Compress-Archive writes them as separators. */
export function safeRelativePath(raw: string): string {
  const name = raw.replace(/\\/g, "/");
  if (name.length === 0 || name.length > LANDING_LIMITS.pathLength) {
    throw new BundleError(`Tên tệp không hợp lệ hoặc quá dài: "${raw.slice(0, 80)}"`);
  }
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new BundleError(`Tên tệp chứa ký tự điều khiển: "${raw.slice(0, 80)}"`);
  }
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) {
    throw new BundleError(`Không chấp nhận đường dẫn tuyệt đối trong ZIP: "${raw}"`);
  }
  const segments = name.split("/");
  if (segments.some((s) => s === ".." || s === ".")) {
    throw new BundleError(`Không chấp nhận đường dẫn chứa "..": "${raw}"`);
  }
  if (segments.some((s) => s === "")) {
    throw new BundleError(`Đường dẫn không hợp lệ trong ZIP: "${raw}"`);
  }
  return segments.join("/");
}

/** index.html at the root, or inside exactly one top folder (which is then stripped). */
function stripSingleTopFolder(paths: string[], warnings: string[]): (path: string) => string {
  if (paths.includes("index.html")) return (path) => path;
  const tops = new Set(paths.map((p) => (p.includes("/") ? p.split("/")[0] : "")));
  const [top] = [...tops];
  if (tops.size === 1 && top !== "" && paths.includes(`${top}/index.html`)) {
    warnings.push(`Đã bỏ thư mục gốc "${top}/" trong ZIP.`);
    return (path) => path.slice(top.length + 1);
  }
  throw new BundleError(
    "Không tìm thấy index.html ở thư mục gốc của ZIP (hoặc trong một thư mục duy nhất).",
  );
}

interface Accepted {
  entry: ZipEntry;
  path: string;
}

function screenEntries(entries: ZipEntry[], warnings: string[]): Accepted[] {
  const accepted: Accepted[] = [];
  let declaredTotal = 0;
  for (const entry of entries) {
    if (entry.isSymlink) throw new BundleError(`ZIP chứa liên kết tượng trưng: "${entry.name}"`);
    if (entry.isDirectory) continue;
    const path = safeRelativePath(entry.name);
    if (JUNK.some((re) => re.test(path))) continue;
    if (entry.isEncrypted) throw new BundleError(`Tệp được đặt mật khẩu: "${path}"`);
    const ext = extensionOf(path);
    const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
    if (SERVER_SIDE.has(ext) || SERVER_SIDE.has(base.replace(/^\./, ""))) {
      throw new BundleError(`ZIP chứa tệp chạy phía máy chủ, không được phép: "${path}"`);
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      warnings.push(`Bỏ qua tệp không thuộc danh sách cho phép: ${path}`);
      continue;
    }
    if (entry.size > LANDING_LIMITS.fileBytes) {
      throw new BundleError(`Tệp "${path}" vượt quá 10 MB.`);
    }
    declaredTotal += entry.size;
    accepted.push({ entry, path });
  }
  if (accepted.length > LANDING_LIMITS.files) {
    throw new BundleError(`ZIP có ${accepted.length} tệp, vượt giới hạn ${LANDING_LIMITS.files}.`);
  }
  if (declaredTotal > LANDING_LIMITS.totalBytes) {
    throw new BundleError("Tổng dung lượng sau giải nén vượt quá 100 MB.");
  }
  return accepted;
}

/** Validate and extract an uploaded landing .zip. Throws BundleError with a user-facing message. */
export async function readLandingBundle(zip: Uint8Array): Promise<LandingBundle> {
  if (zip.byteLength > LANDING_LIMITS.zipBytes) {
    throw new BundleError("Tệp .zip vượt quá 25 MB.");
  }
  let entries: ZipEntry[];
  try {
    entries = listZipEntries(zip);
  } catch (error) {
    if (error instanceof ZipError) throw new BundleError(error.message);
    throw error;
  }
  const warnings: string[] = [];
  const accepted = screenEntries(entries, warnings);
  const strip = stripSingleTopFolder(
    accepted.map((a) => a.path),
    warnings,
  );

  const files = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const { entry, path } of accepted) {
    const finalPath = strip(path);
    const key = finalPath.toLowerCase();
    if (seen.has(key)) throw new BundleError(`ZIP có hai tệp trùng tên: "${finalPath}"`);
    seen.add(key);
    let data: Uint8Array;
    try {
      data = await readZipEntry(zip, entry);
    } catch (error) {
      if (error instanceof ZipError) throw new BundleError(error.message);
      throw error;
    }
    totalBytes += data.byteLength;
    files.set(finalPath, data);
  }
  if (!files.has("index.html")) {
    throw new BundleError("Không tìm thấy index.html ở thư mục gốc của ZIP.");
  }
  return { files, totalBytes, warnings };
}
