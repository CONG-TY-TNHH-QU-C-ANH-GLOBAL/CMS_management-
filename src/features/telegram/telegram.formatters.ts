// HTML formatters for each event type. Telegram parse_mode = "HTML" requires
// & < > to be escaped in user-supplied strings; long fields are truncated so
// a single rogue message doesn't overflow the 4096-char Telegram body limit.

import type {
  ApplicantReceivedPayload,
  DispatchInput,
  DraftPendingReviewPayload,
  LeadReceivedPayload,
  ProviderBreakerTrippedPayload,
  ShippingSyncFailedPayload,
  TranslationFailedPayload,
} from "./telegram.events";

const MAX_BODY = 3800; // safe under Telegram's 4096 limit

export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function clampBody(body: string): string {
  return body.length > MAX_BODY ? body.slice(0, MAX_BODY) + "…" : body;
}

export function formatLead(p: LeadReceivedPayload): string {
  const lines = [
    `🔔 <b>Lead mới #${p.id}</b>`,
    `👤 ${esc(p.name)}`,
    `📧 ${esc(p.email)}`,
  ];
  if (p.phone) lines.push(`📞 ${esc(p.phone)}`);
  if (p.source_page) lines.push(`📍 ${esc(p.source_page)}`);
  if (p.locale) lines.push(`🌐 ${esc(p.locale)}`);
  if (p.message) lines.push("", `<i>${esc(truncate(p.message, 1200))}</i>`);
  return clampBody(lines.join("\n"));
}

export function formatApplicant(p: ApplicantReceivedPayload): string {
  const lines = [
    `📩 <b>Ứng viên mới #${p.id}</b>`,
    `💼 ${esc(p.job_title ?? p.job_slug)}`,
    `👤 ${esc(p.name)}`,
    `📧 ${esc(p.email)}`,
  ];
  if (p.phone) lines.push(`📞 ${esc(p.phone)}`);
  if (p.cv_url) lines.push(`📎 <a href="${esc(p.cv_url)}">Xem CV</a>`);
  if (p.cover_letter) lines.push("", `<i>${esc(truncate(p.cover_letter, 1200))}</i>`);
  return clampBody(lines.join("\n"));
}

export function formatShippingSyncFailed(p: ShippingSyncFailedPayload): string {
  return clampBody(
    [
      `⚠️ <b>Lỗi sync vận chuyển</b>`,
      `📦 Route: <code>${esc(p.route_key)}</code>`,
      `🔁 Lần thử: ${p.attempt_count}`,
      "",
      `<i>${esc(truncate(p.error_message, 800))}</i>`,
    ].join("\n"),
  );
}

export function formatTranslationFailed(p: TranslationFailedPayload): string {
  return clampBody(
    [
      `🛑 <b>Dịch AI thất bại</b>`,
      `📄 ${esc(p.entity_type)} #${p.entity_id}`,
      `🌐 Locale: <code>${esc(p.locale)}</code>`,
      "",
      `<i>${esc(truncate(p.error_message, 800))}</i>`,
    ].join("\n"),
  );
}

export function formatBreakerTripped(p: ProviderBreakerTrippedPayload): string {
  const until = new Date(p.paused_until * 1000).toISOString().replace("T", " ").slice(0, 19);
  return clampBody(
    [
      `🚨 <b>Circuit breaker bật</b>`,
      `🔌 Provider: <code>${esc(p.provider)}</code>`,
      `❌ Số lỗi liên tiếp: ${p.consecutive_failures}`,
      `⏸ Tạm dừng tới: <code>${esc(until)} UTC</code>`,
    ].join("\n"),
  );
}

export function formatDraftPendingReview(p: DraftPendingReviewPayload): string {
  return clampBody(
    [
      `⏳ <b>Bản dịch chờ duyệt quá lâu</b>`,
      `📄 ${esc(p.entity_type)} #${p.entity_id}`,
      `🕒 Tồn đọng: ${p.age_hours}h`,
    ].join("\n"),
  );
}

export function formatChannelTest(channelLabel: string): string {
  return clampBody(
    [
      `✅ <b>Test thành công</b>`,
      `📬 Channel: ${esc(channelLabel)}`,
      `🕘 ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
    ].join("\n"),
  );
}

// Discriminated dispatch — keep formatters separately exported for direct unit
// tests, and one switch here for the dispatcher to use.
export function formatEvent(input: DispatchInput): string {
  switch (input.event_type) {
    case "lead_received":
      return formatLead(input.payload);
    case "applicant_received":
      return formatApplicant(input.payload);
    case "shipping_sync_failed":
      return formatShippingSyncFailed(input.payload);
    case "translation_failed":
      return formatTranslationFailed(input.payload);
    case "provider_breaker_tripped":
      return formatBreakerTripped(input.payload);
    case "draft_pending_review":
      return formatDraftPendingReview(input.payload);
  }
}
