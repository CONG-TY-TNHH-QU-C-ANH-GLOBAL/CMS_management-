// Shared-secret authentication for server-to-server callers.
//
// The CMS has had exactly two kinds of caller until now: a browser with a
// session cookie (admin), and an anonymous browser (public reads + moderated
// writes). A first-party TOOL calling from its own backend is neither — it has
// no cookie to send and no origin worth checking, so `requireSession` cannot
// gate it and `checkPublicMutationOrigin` would be meaningless.
//
// This is deliberately not a user account: there is no identity to attach, no
// role to widen, and nothing here grants more than the one route that calls it
// chooses to expose. Each route names its own secret binding, so revoking one
// integration never touches another.

/** Constant-time comparison. `===` on secrets leaks their prefix length through
 *  timing; the loop below always reads the full width of the longer string. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Length is not itself a secret worth hiding (it is visible in any transport),
  // but the comparison still runs to a fixed width so an early exit cannot
  // reveal WHERE the first mismatch is.
  let diff = left.length ^ right.length;
  const width = Math.max(left.length, right.length);
  for (let i = 0; i < width; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer" || rest.length !== 1) return null;
  return rest[0] || null;
}

export type ServiceTokenOutcome = "ok" | "missing-secret" | "unauthorized";

/**
 * Whether `request` presents `expected`.
 *
 * Fails CLOSED on an unset secret: an unconfigured deployment refuses the call
 * rather than accepting every call, which is what a truthiness check on the
 * binding would have done.
 */
export function checkServiceToken(
  request: Request,
  expected: string | undefined,
): ServiceTokenOutcome {
  if (!expected) return "missing-secret";
  const presented = bearerToken(request);
  if (!presented) return "unauthorized";
  return timingSafeEqual(presented, expected) ? "ok" : "unauthorized";
}

/** JSON refusal for a failed check. Same `{ error }` envelope every other route
 *  in this Worker returns, never cached, and never CORS-enabled — this surface
 *  is for backends, so a browser must not be able to read the response. */
export function serviceTokenRefusal(outcome: Exclude<ServiceTokenOutcome, "ok">): Response {
  const [status, error] =
    outcome === "missing-secret"
      ? ([503, "Tích hợp chưa được cấu hình trên máy chủ."] as const)
      : ([401, "Token không hợp lệ."] as const);
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
