// Fire-and-forget notification sender for /leads + /applicants endpoints.
// Reads telegram_config singleton; broadcasts to every allowed_chat_id when
// the relevant notify flag is on. Failures are swallowed (best-effort).

import { getTelegramConfig } from "./telegram.service";

type NotifyEvent = "new_lead" | "new_applicant";

interface NotifyArgs {
  event: NotifyEvent;
  text: string;
}

async function sendOne(botToken: string, chatId: string, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch {
    // best-effort — swallow
  }
}

export async function notifyTelegram({ event, text }: NotifyArgs): Promise<void> {
  const cfg = await getTelegramConfig();
  if (!cfg.configured || !cfg.bot_token) return;
  const flagOn = event === "new_lead" ? cfg.notify_new_lead : cfg.notify_new_applicant;
  if (!flagOn) return;
  if (cfg.allowed_chat_ids.length === 0) return;

  await Promise.all(cfg.allowed_chat_ids.map((id) => sendOne(cfg.bot_token!, id, text)));
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatLeadMessage(lead: {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  source_page: string | null;
  locale: string | null;
}): string {
  const lines = [
    `🔔 <b>Lead mới #${lead.id}</b>`,
    `👤 ${esc(lead.name)}`,
    `📧 ${esc(lead.email)}`,
  ];
  if (lead.phone) lines.push(`📞 ${esc(lead.phone)}`);
  if (lead.source_page) lines.push(`📍 ${esc(lead.source_page)}`);
  if (lead.locale) lines.push(`🌐 ${esc(lead.locale)}`);
  if (lead.message) lines.push("", `<i>${esc(lead.message)}</i>`);
  return lines.join("\n");
}

export function formatApplicantMessage(applicant: {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  cv_url: string | null;
  cover_letter: string | null;
  job_slug: string;
  job_title?: string;
  locale: string;
}): string {
  const lines = [
    `📩 <b>Ứng viên mới #${applicant.id}</b>`,
    `💼 ${esc(applicant.job_title ?? applicant.job_slug)}`,
    `👤 ${esc(applicant.name)}`,
    `📧 ${esc(applicant.email)}`,
  ];
  if (applicant.phone) lines.push(`📞 ${esc(applicant.phone)}`);
  if (applicant.cv_url) lines.push(`📎 <a href="${esc(applicant.cv_url)}">Xem CV</a>`);
  if (applicant.cover_letter) {
    const preview = applicant.cover_letter.length > 400
      ? applicant.cover_letter.slice(0, 400) + "…"
      : applicant.cover_letter;
    lines.push("", `<i>${esc(preview)}</i>`);
  }
  return lines.join("\n");
}
