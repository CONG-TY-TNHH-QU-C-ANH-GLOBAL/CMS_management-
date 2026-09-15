// Public API of the auth feature
export * from "./auth.service";
export {
  buildClearCookie,
  buildSessionCookie,
  destroySession,
  parseSessionCookie,
  SESSION_COOKIE,
} from "./auth.session";
export type { ActiveSession, Role, SessionUser } from "./auth.session";
export {
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAuthConfigError,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  generateStateToken,
} from "./auth.google";
export type { GoogleUserInfo } from "./auth.google";
export {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  assertPasswordPolicy,
  hashPassword,
  verifyPassword,
} from "./auth.password";
export { withRequiredSession, requiredRoleOf } from "./auth.guard";
export type { GuardedHandler } from "./auth.guard";
