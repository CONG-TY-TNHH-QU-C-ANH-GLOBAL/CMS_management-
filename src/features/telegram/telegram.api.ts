// Low-level Telegram Bot API wrapper. Single attempt — the outbox does the
// retry, so this layer returns a discriminated result the worker can use to
// decide "increment attempts" vs "fail permanently". Modeled on
// translations.openai.ts:callOnce (timeout via AbortController, 4xx vs 5xx
// classification, structured error parse).

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 30_000;

export type SendResult =
  | { kind: "ok" }
  | { kind: "transient"; status?: number; message: string; retryAfterSec?: number }
  | { kind: "permanent"; status?: number; message: string };

interface TelegramApiError {
  ok: false;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

/** POST sendMessage. Returns a SendResult — the caller (outbox worker) handles
 *  attempts/backoff/terminal transitions. */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  bodyText: string,
): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Telegram accepts chat_id as int OR string, but for negative channel/
    // supergroup ids (-100xxxxxxxxxx) sending it as a JSON STRING is flaky —
    // observed `400 Bad Request: chat not found` despite the bot being a valid
    // admin in the channel (the same id via URL ?chat_id=... works). Convert
    // numeric ids (incl. signed negative) to Number; leave @username strings
    // alone so public-channel send-by-handle still works.
    const chatIdValue: string | number = /^-?\d+$/.test(chatId)
      ? Number(chatId)
      : chatId;
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatIdValue,
        text: bodyText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (res.ok) return { kind: "ok" };

    // Parse Telegram's structured error body.
    let parsed: TelegramApiError | null = null;
    try {
      parsed = (await res.json()) as TelegramApiError;
    } catch {
      /* ignore */
    }
    const message = parsed?.description ?? `${res.status} ${res.statusText}`;
    const retryAfterSec = parsed?.parameters?.retry_after;

    // 429 (rate limit) → transient; outbox respects retry_after.
    if (res.status === 429) {
      return { kind: "transient", status: 429, message, retryAfterSec };
    }
    // 5xx → transient.
    if (res.status >= 500 && res.status < 600) {
      return { kind: "transient", status: res.status, message };
    }
    // Everything else (400 bad request, 401 unauthorized, 403 forbidden,
    // 404 chat not found) is permanent — won't fix by retrying.
    return { kind: "permanent", status: res.status, message };
  } catch (err) {
    // Network / abort / DNS → transient.
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "transient", message };
  } finally {
    clearTimeout(timer);
  }
}

/** GET getMe — used by the admin "Test bot" button to verify token reachability. */
export async function telegramGetMe(
  botToken: string,
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getMe`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { ok?: boolean; result?: { username?: string }; description?: string };
    if (body.ok && body.result?.username) return { ok: true, username: body.result.username };
    return { ok: false, error: body.description ?? "Unknown error" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
