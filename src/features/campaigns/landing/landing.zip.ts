// Minimal ZIP reader for landing uploads. No dependency: the repo has no zip
// library, and Workers ship DecompressionStream("deflate-raw"), which is all a
// ZIP needs besides parsing the central directory.
//
// Scope is deliberately narrow: stored (0) and deflate (8) entries, no ZIP64,
// no encryption, no multi-disk archives. Anything else is rejected with a
// message rather than half-read. Sizes in the central directory are checked
// against the caller's caps BEFORE inflating, and inflation is cut off as soon
// as it produces more bytes than declared, so a zip bomb never reaches memory.

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipEntry {
  /** Raw name as stored (decoded as UTF-8; ZIP tools on Windows may use "\"). */
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc32: number;
  isDirectory: boolean;
  isSymlink: boolean;
  isEncrypted: boolean;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;

const decoder = new TextDecoder("utf-8");

function findEndOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - EOCD_MIN - MAX_COMMENT);
  for (let i = view.byteLength - EOCD_MIN; i >= lowest; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  throw new ZipError("Tệp không phải .zip hợp lệ (không tìm thấy mục lục ZIP).");
}

/** Parse the central directory. Throws ZipError for anything unsupported. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < EOCD_MIN) throw new ZipError("Tệp .zip rỗng hoặc bị hỏng.");
  const eocd = findEndOfCentralDirectory(view);
  const disk = view.getUint16(eocd + 4, true);
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0) throw new ZipError("ZIP nhiều phần (multi-disk) không được hỗ trợ.");
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new ZipError("ZIP64 không được hỗ trợ — hãy nén lại bằng công cụ thông thường.");
  }
  if (cdOffset + cdSize > eocd) throw new ZipError("Mục lục ZIP bị hỏng.");

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || view.getUint32(p, true) !== CENTRAL_SIGNATURE) {
      throw new ZipError("Mục lục ZIP bị hỏng.");
    }
    const madeBy = view.getUint16(p + 4, true) >> 8;
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc32 = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const externalAttrs = view.getUint32(p + 38, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    // Unix "made by" (3) carries the mode in the high 16 bits of the external attributes.
    const mode = madeBy === 3 ? (externalAttrs >>> 16) & S_IFMT : 0;
    entries.push({
      name,
      method,
      compressedSize,
      size,
      crc32,
      isDirectory: name.endsWith("/") || name.endsWith("\\") || mode === S_IFDIR,
      isSymlink: mode === S_IFLNK,
      isEncrypted: (flags & 0x1) !== 0,
      localHeaderOffset,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const out = new Uint8Array(expected);
  let written = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (written + value.byteLength > expected) {
      await reader.cancel();
      throw new ZipError("Kích thước tệp trong ZIP không khớp (có thể là zip bomb).");
    }
    out.set(value, written);
    written += value.byteLength;
  }
  if (written !== expected) throw new ZipError("Tệp trong ZIP bị hỏng (thiếu dữ liệu).");
  return out;
}

/** Read one entry's bytes and verify its CRC. */
export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.localHeaderOffset;
  if (p + 30 > bytes.byteLength || view.getUint32(p, true) !== LOCAL_SIGNATURE) {
    throw new ZipError(`Tệp "${entry.name}" trong ZIP bị hỏng.`);
  }
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.byteLength) throw new ZipError(`Tệp "${entry.name}" trong ZIP bị cắt cụt.`);
  const raw = bytes.subarray(start, end);
  let data: Uint8Array;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) throw new ZipError(`Tệp "${entry.name}" bị hỏng.`);
    data = raw;
  } else if (entry.method === 8) {
    data = await inflateRaw(raw, entry.size);
  } else {
    throw new ZipError(`Tệp "${entry.name}" dùng kiểu nén không hỗ trợ (method ${entry.method}).`);
  }
  if (crc32(data) !== entry.crc32) throw new ZipError(`Tệp "${entry.name}" sai checksum.`);
  return data;
}
