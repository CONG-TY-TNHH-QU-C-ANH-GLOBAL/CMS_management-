// Owner-token helpers for public Q&A withdrawal.
//
// The raw token is handed to the submitter exactly once (in the submit
// response) and stored client-side (localStorage). We persist only its
// SHA-256 hash, so reading the DB never yields a usable token. Withdrawal
// re-hashes the presented token and compares against the stored hash.

/** 256-bit random token as hex — handed to the submitter once, never stored. */
export function generateOwnerToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex of a token — the only form we persist and compare against. */
export async function hashOwnerToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
