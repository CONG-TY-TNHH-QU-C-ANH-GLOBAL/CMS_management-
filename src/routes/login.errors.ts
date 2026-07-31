// Bounded login-error contract (pure, dependency-free so it is unit-testable — login.tsx transitively
// imports the cloudflare:workers env, which bun:test cannot resolve). Only allowlisted codes map to a
// fixed localized message; anything else (unknown, malformed, or excessively long) maps to ONE generic
// message. The raw query-string value is NEVER rendered.

/** Allowlisted login error codes → fixed localized messages. */
export const ERROR_MESSAGES: Record<string, string> = {
  email_not_invited: "Email này chưa được mời vào CMS. Liên hệ quản trị viên để được cấp quyền.",
  user_disabled: "Tài khoản này đã bị vô hiệu hoá. Liên hệ quản trị viên.",
  email_not_verified: "Email Google chưa xác thực. Hãy xác thực email rồi thử lại.",
  invalid_state: "Phiên đăng nhập đã hết hạn. Thử đăng nhập lại.",
  missing_code_or_state: "Quy trình đăng nhập bị gián đoạn. Thử lại.",
  token_exchange_failed: "Không kết nối được với Google. Thử lại sau ít phút.",
  access_denied: "Bạn đã từ chối cấp quyền cho Google.",
  oauth_not_configured: "Đăng nhập Google chưa được cấu hình trên máy chủ. Liên hệ quản trị viên.",
};

/** The single fallback shown for any error code that is not an allowlisted key. */
export const GENERIC_LOGIN_ERROR =
  "Đăng nhập không thành công. Thử lại hoặc liên hệ quản trị viên.";

/** Resolve a login error code to a bounded localized message (null when there is no error). Uses
 *  Object.hasOwn so inherited keys (`constructor`, `__proto__`, `toString`, …) never match, and never
 *  echoes the raw code. */
export function resolveLoginError(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : GENERIC_LOGIN_ERROR;
}
