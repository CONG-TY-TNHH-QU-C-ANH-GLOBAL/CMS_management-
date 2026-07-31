// Service-aware, MULTI-INTENT lead request contract (single source of truth for POST /leads).
//
// A lead is NOT one exclusive service (land-and-expand): it has an optional primary intent, zero
// or more service interests, and per-service validated details. This module owns the canonical
// registry (SERVICE_KEYS + per-service details schemas), the surface keys, and the validation
// rules. It is free of DB / framework / transport concerns so scripts/leads-contract-selfcheck.ts
// can exercise it without a database.
//
// Dimensions kept separate: primaryService · serviceInterests[] · surface · source_page · utm ·
// detailsByService. No service is inferred from pathname, surface, utm, or labels.
//
// CROSS-REPOSITORY CONTRACT: SERVICE_KEYS / SURFACE_KEYS are a PUBLIC request contract shared with
// the landing app (next/src/shared/ui/lead-services.ts). THIS backend validation is authoritative;
// the landing keys must stay compatible. Adding a service requires a COORDINATED change in both
// repos (a key + details schema here, a mirror key + optional field group there). CMS service
// slugs and display labels (e.g. thg-order / "THG Dropship") are NOT canonical service keys.
import { z } from "zod";

// ─── Canonical service registry (code-owned, extensible) ──────────────────────────────────────
// Add a service = add ONE entry here (a key + its strict details schema). SERVICE_KEYS derives
// from it; `satisfies` guarantees every key has a schema. Services without verified specific
// fields use an empty strict object (common envelope only — never fabricated fields). Fulfill's
// product_type is grounded in the approved catalog categories.
export const SERVICE_KEYS = ["fulfill", "express", "warehouse", "dropship"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const FULFILL_PRODUCT_TYPES = ["apparel", "drinkware", "fleece", "other"] as const;

const SERVICE_DETAILS_SCHEMAS = {
  fulfill: z.object({ product_type: z.enum(FULFILL_PRODUCT_TYPES).optional() }).strict(),
  express: z.object({}).strict(),
  warehouse: z.object({}).strict(),
  dropship: z.object({}).strict(),
} satisfies Record<ServiceKey, z.ZodTypeAny>;

function isServiceKey(value: string): value is ServiceKey {
  return (SERVICE_KEYS as readonly string[]).includes(value);
}

// ─── Canonical UI-surface keys (attribution — the form that produced the lead) ────────────────
export const SURFACE_KEYS = [
  "global-services-dialog",
  "fulfill-inline",
  "express-inline",
  "warehouse-inline",
  "dropship-inline",
  "home-conversion-inline",
] as const;
export type SurfaceKey = (typeof SURFACE_KEYS)[number];

// Common envelope + the multi-intent dimensions (all optional so the migration deploys before the
// new client; the cross-field rules below enforce a coherent shape).
const leadRequestBaseSchema = z.object({
  name: z.string().trim().min(1, "Tên không được rỗng").max(120),
  email: z.string().trim().email("Email không hợp lệ").max(254),
  phone: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  source_page: z.string().trim().max(500).optional().nullable(),
  locale: z.enum(["en", "vi", "zh"]).optional().nullable(),
  utm: z.record(z.string()).optional().nullable(),
  primary_service: z.enum(SERVICE_KEYS).optional().nullable(),
  service_interests: z.array(z.enum(SERVICE_KEYS)).optional().nullable(),
  // Object keyed by service key → that service's details; validated per-key in a second step so
  // the error can name the offending service.
  service_details: z.record(z.string(), z.record(z.string(), z.unknown())).optional().nullable(),
  surface: z.enum(SURFACE_KEYS).optional().nullable(),
  turnstile_token: z.string().min(1, "Missing Turnstile token"),
});

export interface NormalizedLeadRequest {
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  source_page: string | null;
  locale: "en" | "vi" | "zh" | null;
  utm: Record<string, string> | null;
  /** Highest-priority intent at capture; null for a generic/unclassified lead. When set, it is a
   *  member of service_interests. Not a permanent customer classification. */
  primary_service: ServiceKey | null;
  /** All service interests (primary + secondaries), de-duplicated; [] for a generic lead. */
  service_interests: ServiceKey[];
  /** Validated details keyed by service (subset of service_interests); null when none carry data. */
  service_details: Record<string, Record<string, unknown>> | null;
  surface: SurfaceKey | null;
  turnstile_token: string;
}

export type ParseLeadResult =
  | { ok: true; value: NormalizedLeadRequest }
  | { ok: false; message: string };

/** Internal helper outcome — a validated value or the first user-safe rejection message. */
type Validated<T> = { ok: true; value: T } | { ok: false; message: string };

/** Reject duplicates, require the primary to belong to the interests, and return the deterministic
 *  persisted order: primary first (when present), then the remaining services in canonical registry
 *  order. Never depends on client checkbox/submission order. */
function normalizeServiceInterests(
  primary: ServiceKey | null,
  interests: ServiceKey[],
): Validated<ServiceKey[]> {
  if (new Set(interests).size !== interests.length) {
    return { ok: false, message: "service_interests must not contain duplicates" };
  }
  if (primary !== null && !interests.includes(primary)) {
    return { ok: false, message: "primary_service must be included in service_interests" };
  }
  const ordered: ServiceKey[] = [
    ...(primary ? [primary] : []),
    ...SERVICE_KEYS.filter((k) => interests.includes(k) && k !== primary),
  ];
  return { ok: true, value: ordered };
}

/** Validate each present details entry against the matching strict service schema. Detail keys must
 *  be a subset of the selected interests; unknown services and unknown detail keys are rejected;
 *  empty per-service objects are dropped; null when no meaningful details remain. */
function normalizeServiceDetails(
  details: Record<string, Record<string, unknown>> | null | undefined,
  interests: readonly ServiceKey[],
): Validated<Record<string, Record<string, unknown>> | null> {
  if (!details) return { ok: true, value: null };
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!isServiceKey(key)) {
      return { ok: false, message: `Unknown service in service_details: "${key}"` };
    }
    if (!interests.includes(key)) {
      return {
        ok: false,
        message: `service_details for "${key}" is not a selected service interest`,
      };
    }
    const parsed = SERVICE_DETAILS_SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      const path = issue?.path.join(".");
      const detailPathSuffix = path ? ` (${path})` : "";
      const validationReason = issue?.message ?? "validation failed";
      return {
        ok: false,
        message: `Invalid details for service "${key}"${detailPathSuffix}: ${validationReason}`,
      };
    }
    // Drop empty per-service objects — a selected interest with no captured detail carries none.
    if (Object.keys(parsed.data as object).length > 0) {
      out[key] = parsed.data as Record<string, unknown>;
    }
  }
  return { ok: true, value: Object.keys(out).length > 0 ? out : null };
}

/** Validate a raw POST /leads body into a normalized multi-intent request — or a 400 message.
 *  Orchestration only: base parse → focused normalizers (first failure wins) → assemble.
 *  Turnstile verification, rate limiting and persistence are the caller's responsibility. */
export function parseLeadRequest(body: unknown): ParseLeadResult {
  const base = leadRequestBaseSchema.safeParse(body);
  if (!base.success) {
    return { ok: false, message: base.error.errors[0]?.message ?? "Validation failed" };
  }
  const b = base.data;
  const primary = b.primary_service ?? null;

  const interests = normalizeServiceInterests(primary, b.service_interests ?? []);
  if (!interests.ok) return { ok: false, message: interests.message };

  const details = normalizeServiceDetails(b.service_details, interests.value);
  if (!details.ok) return { ok: false, message: details.message };

  return {
    ok: true,
    value: {
      name: b.name,
      email: b.email,
      phone: b.phone ?? null,
      message: b.message ?? null,
      source_page: b.source_page ?? null,
      locale: b.locale ?? null,
      utm: b.utm ?? null,
      primary_service: primary,
      service_interests: interests.value,
      service_details: details.value,
      surface: b.surface ?? null,
      turnstile_token: b.turnstile_token,
    },
  };
}
