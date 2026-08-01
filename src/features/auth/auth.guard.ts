// Authenticated route handlers with INSPECTABLE authorization metadata.
//
// The public-surface gate used to prove "this admin route is authenticated" by grepping the
// route file for `requireSession(`. That is not a security boundary:
//
//   - a comment mentioning requireSession( satisfies it;
//   - a string literal satisfies it;
//   - reformatting the file can break it (the pattern was indentation-anchored);
//   - a wrapper or alias that really does authenticate does NOT satisfy it;
//   - dead code in an unreachable branch satisfies it.
//
// The fix is not a better pattern. It is to make the authorization decision part of the
// handler VALUE the router registers, so a test can read it from the imported module instead
// of from the file's text.
//
// `withRequiredSession` is the only way to obtain that metadata, and it is the same call that
// performs the check — so the brand cannot be present without the check running, and the check
// cannot run through this helper without the brand being visible. A handler that authenticates
// some other way is simply not branded, and the gate reports it.

import type { Role, SessionUser } from "./auth.session";

// `requireSession` is imported LAZILY inside the wrapper, not at module load. It reaches the
// D1 client and `cloudflare:workers`, which do not exist outside the Worker runtime — and
// `requiredRoleOf` below must stay importable anywhere so the public-surface gate can read the
// brand without booting the database layer. The route handlers in this repo already use the
// same dynamic-import shape, so the Worker's cold-start graph is unchanged.

/** Property carrying the minimum role a branded handler enforces. Non-enumerable so it never
 *  leaks into a response body, a log line or a JSON serialization of the handler. */
const REQUIRED_ROLE = Symbol.for("thg.auth.requiredRole");

/** The handler a guarded route provides. It receives the authenticated user, so it never has
 *  to call `requireSession` a second time to learn who is acting. */
type GuardedRouteHandler<Ctx> = (ctx: Ctx, user: SessionUser) => Response | Promise<Response>;

export type GuardedHandler<Ctx> = (ctx: Ctx) => Promise<Response>;

/**
 * Wrap a route handler so the session check runs before it AND the enforced role is readable
 * from the handler object.
 *
 * The wrapper awaits `requireSession(role)` first; if it throws (401/403) the inner handler is
 * never reached. `requireSession` also performs the CSRF origin check for state-changing
 * methods, so that behavior is preserved exactly.
 */
export function withRequiredSession<Ctx>(
  role: Role,
  handler: GuardedRouteHandler<Ctx>,
): GuardedHandler<Ctx> {
  const guarded = async (ctx: Ctx): Promise<Response> => {
    const { requireSession } = await import("./auth.service");
    const user = await requireSession(role);
    return handler(ctx, user);
  };
  Object.defineProperty(guarded, REQUIRED_ROLE, {
    value: role,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return guarded as GuardedHandler<Ctx>;
}

/** The role a handler enforces, or null when it is not a guarded handler. Used by the
 *  public-surface gate to verify authorization against the route classification. */
export function requiredRoleOf(handler: unknown): Role | null {
  if (typeof handler !== "function") return null;
  const role = (handler as unknown as Record<symbol, unknown>)[REQUIRED_ROLE];
  return typeof role === "string" ? (role as Role) : null;
}
