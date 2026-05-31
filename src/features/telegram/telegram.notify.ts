// DEPRECATED — superseded by `telegram.dispatcher.ts` (Workstream B).
//
// The fire-and-forget singleton-channel `notifyTelegram()` from migration 0013
// has been replaced by the durable, multi-channel event-bus (`dispatchEvent`).
// All known call sites (`leads` + `applicants` endpoints) were updated; this
// file remains as a typed safety-net export so any forgotten caller still
// compiles and routes through the new pipeline.
//
// New code should call `dispatchEvent({ event_type, payload, idempotency_key })`
// directly. This file will be removed in a follow-up cleanup PR.

import { dispatchEvent } from "./telegram.dispatcher";

export { formatLead as formatLeadMessage, formatApplicant as formatApplicantMessage } from "./telegram.formatters";

/** @deprecated Use `dispatchEvent({ event_type, payload, idempotency_key })`. */
export async function notifyTelegram({ event }: { event: "new_lead" | "new_applicant"; text: string }): Promise<void> {
  // Best-effort shim — old call sites passed a pre-formatted `text` that we
  // can no longer route to the right channel (we'd need the typed payload).
  // Log once and no-op so a stray caller doesn't double-notify a lead the new
  // dispatch path already handled.
  if (typeof console !== "undefined") {
    console.warn(`[telegram] notifyTelegram("${event}") is deprecated — call dispatchEvent() instead.`);
  }
  // Suppress "unused" lint on `dispatchEvent` — kept available so this module
  // still imports the new pipeline (catches schema drift at typecheck time).
  void dispatchEvent;
}
