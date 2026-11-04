import type { Role } from "./auth.session";

// Temporary incident trace. Stops emitting automatically, even before removal.
export const LOGIN_DIAGNOSTICS_UNTIL = Date.parse("2026-11-05T04:00:00Z");

type FailureReason =
  | "token_exchange_failed"
  | "email_not_verified"
  | "email_not_invited"
  | "user_disabled"
  | "user_mapping_failed"
  | "session_issue_failed";

type Detail =
  | { stage: "provider" | "provider_uncached"; emailFingerprint: string; emailVerified: boolean }
  | { stage: "mapped"; userId: number; role: Role; emailMatchesProvider: boolean }
  | { stage: "issued"; userId: number }
  | { stage: "failed"; reason: FailureReason }
  | { stage: "unavailable" };

export function createLoginDiagnostic() {
  const correlationId = Date.now() < LOGIN_DIAGNOSTICS_UNTIL ? crypto.randomUUID() : undefined;

  function record(detail: Detail) {
    if (!correlationId || Date.now() >= LOGIN_DIAGNOSTICS_UNTIL) return;
    try {
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: detail.stage === "failed" || detail.stage === "unavailable" ? "warn" : "info",
          event: "auth.login.diagnostic",
          correlationId,
          ...detail,
        }),
      );
    } catch {
      // A broken diagnostic sink must never change an authentication outcome.
    }
  }

  return {
    correlationId,
    get enabled(): boolean {
      return !!correlationId && Date.now() < LOGIN_DIAGNOSTICS_UNTIL;
    },
    async provider(email: string, emailVerified: boolean, uncached = false): Promise<void> {
      if (!correlationId || Date.now() >= LOGIN_DIAGNOSTICS_UNTIL) return;
      try {
        const canonical = `thg-auth-login-v1\n${email.toLowerCase().trim()}`;
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
        const emailFingerprint = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        record({
          stage: uncached ? "provider_uncached" : "provider",
          emailFingerprint,
          emailVerified,
        });
      } catch {
        record({ stage: "unavailable" });
      }
    },
    mapped(userId: number, role: Role, emailMatchesProvider: boolean): void {
      record({ stage: "mapped", userId, role, emailMatchesProvider });
    },
    issued(userId: number): void {
      record({ stage: "issued", userId });
    },
    failed(reason: FailureReason): void {
      record({ stage: "failed", reason });
    },
    unavailable(): void {
      record({ stage: "unavailable" });
    },
  };
}
