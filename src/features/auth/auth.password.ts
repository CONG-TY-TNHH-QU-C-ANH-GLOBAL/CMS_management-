// Password hashing for local login. PBKDF2-SHA256 via Web Crypto — the only
// KDF available in the Workers runtime without shipping a WASM bcrypt/argon2
// build. The iteration count is stored inside each hash so it can be raised
// later without invalidating existing passwords.

const ALGORITHM = "pbkdf2";
const DIGEST = "sha256";
const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

// Crypto APIs require a non-shared backing buffer, so pin the element type
// rather than the default Uint8Array<ArrayBufferLike>.
type Bytes = Uint8Array<ArrayBuffer>;

function toBase64(bytes: Bytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Bytes,
  iterations: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return [ALGORITHM, DIGEST, ITERATIONS, toBase64(salt), toBase64(hash)].join("$");
}

/**
 * Verify `password` against a stored hash. Returns false — never throws — for
 * anything unreadable, so a legacy or corrupted row reads as a failed login
 * rather than a 500 that would leak which accounts have odd hashes.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5) return false;
  const [algorithm, digest, rawIterations, rawSalt, rawHash] = parts;
  if (algorithm !== ALGORITHM || digest !== DIGEST) return false;

  const iterations = Number(rawIterations);
  if (!Number.isInteger(iterations) || iterations < 1) return false;

  let salt: Bytes;
  let expected: Bytes;
  try {
    salt = fromBase64(rawSalt);
    expected = fromBase64(rawHash);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** Throws a 400 when the password fails policy. Callers pass raw user input. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw Object.assign(
      new Error(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`),
      { statusCode: 400, code: "WEAK_PASSWORD" },
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw Object.assign(
      new Error(`Mật khẩu không được dài quá ${MAX_PASSWORD_LENGTH} ký tự.`),
      { statusCode: 400, code: "WEAK_PASSWORD" },
    );
  }
}
