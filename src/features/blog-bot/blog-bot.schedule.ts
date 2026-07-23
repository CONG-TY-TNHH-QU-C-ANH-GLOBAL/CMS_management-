// Blog Auto-Bot — PURE scheduling logic (no DB / no worker bindings), so it is
// unit-testable under `bun test`. Only a type import from the service (erased
// at runtime), never a value import.

import type { BlogBotCampaignRow } from "@/features/blog-bot/blog-bot.service";

/** Local calendar date (YYYY-MM-DD) + time (HH:MM) in a timezone. Falls back to
 *  UTC if the tz string is invalid. Date/new Date() are fine in the Worker
 *  runtime (only workflow scripts forbid them). */
export function localParts(tz: string, atMs: number): { date: string; time: string } {
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz }).formatToParts(
      new Date(atMs),
    );
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" }).formatToParts(
      new Date(atMs),
    );
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00"; // en-CA hour12:false emits 24 at midnight
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

/** True if an enabled campaign is due to run now: local time has reached
 *  run_time AND it has not already run today (per last_run_at in its tz). Pure. */
export function isCampaignDue(campaign: BlogBotCampaignRow, atMs: number): boolean {
  if (campaign.enabled !== 1) return false;
  const tz = campaign.timezone || "Asia/Ho_Chi_Minh";
  const now = localParts(tz, atMs);
  // HH:MM strings are zero-padded → lexical compare == chronological compare.
  if (now.time < campaign.run_time) return false;
  if (campaign.last_run_at) {
    const last = localParts(tz, campaign.last_run_at * 1000);
    if (last.date === now.date) return false; // already ran today
  }
  return true;
}
