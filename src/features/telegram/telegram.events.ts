// Telegram event-bus — single source of truth for event types.
//
// EVENT_TYPES drives: the admin subscription matrix UI, dispatcher validation,
// formatter dispatch. Adding a new event = add an entry here + a formatter +
// (optionally) an emit call site. Subscriptions table stores event_type as
// TEXT so unknown values are tolerated (forward compat); the UI only renders
// rows it knows about.

export const EVENT_TYPES = [
  // Ops events — leads, applicants, customer-facing failures.
  {
    type: "lead_received",
    label: "Lead mới (form tư vấn)",
    kind: "ops",
    description: "Khách gửi form Liên hệ / Tư vấn trên landing.",
  },
  {
    type: "applicant_received",
    label: "Ứng viên mới (tuyển dụng)",
    kind: "ops",
    description: "Có người nộp đơn ứng tuyển một JD.",
  },
  {
    type: "shipping_sync_failed",
    label: "Lỗi sync chính sách vận chuyển",
    kind: "ops",
    description: "Google Sheet → D1 → landing đồng bộ thất bại.",
  },
  // Infra events — engineering / SRE.
  {
    type: "translation_failed",
    label: "Dịch AI thất bại",
    kind: "infra",
    description: "OpenAI trả lỗi hoặc bản dịch không đạt validation.",
  },
  {
    type: "provider_breaker_tripped",
    label: "Circuit breaker bật",
    kind: "infra",
    description: "Provider AI bị tạm dừng do nhiều lỗi liên tiếp.",
  },
  // Reserved — emitter wired in a later PR.
  {
    type: "draft_pending_review",
    label: "Bản dịch chờ duyệt quá lâu",
    kind: "ops",
    description: "(Chưa kích hoạt) — draft tồn đọng quá N giờ.",
  },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["type"];
export type ChannelKind = "ops" | "infra" | "custom";

export function isKnownEventType(value: string): value is EventType {
  return EVENT_TYPES.some((e) => e.type === value);
}

export const EVENT_TYPES_BY_KIND: Record<"ops" | "infra", EventType[]> = {
  ops: EVENT_TYPES.filter((e) => e.kind === "ops").map((e) => e.type),
  infra: EVENT_TYPES.filter((e) => e.kind === "infra").map((e) => e.type),
};

// Payload shapes per event_type — the dispatcher takes a discriminated union
// so formatters can be type-safe without runtime branching.

export interface LeadReceivedPayload {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  source_page: string | null;
  locale: string | null;
}

export interface ApplicantReceivedPayload {
  id: number;
  job_slug: string;
  job_title?: string;
  name: string;
  email: string;
  phone: string | null;
  cv_url: string | null;
  cover_letter: string | null;
  locale: string;
}

export interface ShippingSyncFailedPayload {
  route_key: string;
  error_message: string;
  attempt_count: number;
}

export interface TranslationFailedPayload {
  entity_type: string;
  entity_id: number;
  locale: string;
  error_message: string;
}

export interface ProviderBreakerTrippedPayload {
  provider: string;
  consecutive_failures: number;
  paused_until: number;
}

export interface DraftPendingReviewPayload {
  entity_type: string;
  entity_id: number;
  age_hours: number;
}

export type DispatchInput =
  | { event_type: "lead_received"; payload: LeadReceivedPayload; idempotency_key?: string }
  | { event_type: "applicant_received"; payload: ApplicantReceivedPayload; idempotency_key?: string }
  | { event_type: "shipping_sync_failed"; payload: ShippingSyncFailedPayload; idempotency_key?: string }
  | { event_type: "translation_failed"; payload: TranslationFailedPayload; idempotency_key?: string }
  | { event_type: "provider_breaker_tripped"; payload: ProviderBreakerTrippedPayload; idempotency_key?: string }
  | { event_type: "draft_pending_review"; payload: DraftPendingReviewPayload; idempotency_key?: string };
