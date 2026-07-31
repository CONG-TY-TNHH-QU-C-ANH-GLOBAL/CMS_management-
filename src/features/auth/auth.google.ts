import { env } from "cloudflare:workers";
import "@/core/db/env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export const OAUTH_STATE_COOKIE = "thg_oauth_state";
export const OAUTH_REDIRECT_COOKIE = "thg_oauth_redirect";

/** Raised when a required Google OAuth binding is absent, so callers fail loud with an
 *  actionable server-side message instead of building a broken Google request (an empty
 *  `client_id` makes accounts.google.com return "Missing required parameter: client_id").
 *  The message names the missing VARIABLE only — never its value (GOOGLE_CLIENT_SECRET's value is
 *  confidential; and no config value belongs in an error surfaced to logs or the browser). */
export class OAuthConfigError extends Error {
  constructor(varName: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET") {
    super(`Google OAuth is not configured: ${varName} is missing`);
    this.name = "OAuthConfigError";
  }
}

/** A bounded provider error: carries ONLY safe metadata (operation, HTTP status, and a safely-parsed
 *  short provider error code). It never contains the raw Google response body, request body, or any
 *  credential — so it is safe to log and to map to the fixed `token_exchange_failed` browser code. */
export class GoogleProviderError extends Error {
  constructor(
    readonly operation: "token exchange" | "userinfo",
    readonly status: number,
    readonly providerCode?: string,
  ) {
    super(GoogleProviderError.formatMessage(operation, status, providerCode));
    this.name = "GoogleProviderError";
  }

  /** Build the bounded message from named parts — no nested template literals, and never any raw
   *  provider body, error_description, credential, code, or token. */
  private static formatMessage(operation: string, status: number, providerCode?: string): string {
    const providerCodeSuffix = providerCode ? ` (${providerCode})` : "";
    return `Google ${operation} failed: HTTP ${status}${providerCodeSuffix}`;
  }
}

/** Extract Google's short OAuth error code (e.g. `invalid_grant`) from an error response WITHOUT
 *  surfacing the raw body — returns it only when it is a bounded lowercase token, else undefined. */
async function safeProviderErrorCode(res: Response): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await res.text()) as { error?: unknown };
    const code = parsed.error;
    return typeof code === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(code) ? code : undefined;
  } catch {
    return undefined; // non-JSON or unparsable body → no code, and the raw text is discarded
  }
}

function requireOAuthEnv(varName: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"): string {
  const value = env[varName];
  const trimmed = value?.trim() ?? "";
  // Reject undefined / empty / whitespace-only; return the trimmed value so stray surrounding
  // whitespace in a binding never corrupts the Google request.
  if (trimmed === "") throw new OAuthConfigError(varName);
  return trimmed;
}

export function getRedirectUri(): string {
  return `${env.OAUTH_REDIRECT_BASE}/api/auth/google/callback`;
}

export function generateStateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireOAuthEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<{ access_token: string; id_token?: string }> {
  const body = new URLSearchParams({
    code,
    client_id: requireOAuthEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireOAuthEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new GoogleProviderError("token exchange", res.status, await safeProviderErrorCode(res));
  }
  return res.json();
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new GoogleProviderError("userinfo", res.status);
  }
  return res.json();
}
