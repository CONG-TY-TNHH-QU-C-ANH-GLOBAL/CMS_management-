// PURE: per-model OpenAI pricing table + cost computation.
// `estimated_cost_usd` is stored on every ai_translation_log row at write
// time using THEN-current prices. Dashboards must NOT recompute from
// tokens at read time — OpenAI changes prices and historical accuracy
// matters for cost trend analysis. See spec §9.

export type SupportedModel = "gpt-4o-mini" | "gpt-4o";

interface ModelRate {
  /** USD cost per 1 million input tokens. */
  in_per_mtok: number;
  /** USD cost per 1 million output tokens. */
  out_per_mtok: number;
}

// Update this table when OpenAI prices change. Historical
// ai_translation_log.estimated_cost_usd values are NOT recalculated —
// they freeze the cost as it was at call time.
export const MODEL_PRICING: Record<SupportedModel, ModelRate> = {
  "gpt-4o-mini": { in_per_mtok: 0.15, out_per_mtok: 0.6 },
  "gpt-4o": { in_per_mtok: 2.5, out_per_mtok: 10.0 },
};

export function computeCostUsd(model: string, tokens_in: number, tokens_out: number): number {
  const rate = MODEL_PRICING[model as SupportedModel];
  if (!rate) return 0; // Unknown model — log as 0 cost; analytics will surface
  const cost = (tokens_in * rate.in_per_mtok + tokens_out * rate.out_per_mtok) / 1_000_000;
  // Round to 6 decimals — 1 micro-USD precision, enough for cost dashboards.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Default model per entity type (spec §5.3). Operator can override via
 *  the `model` request parameter. */
export function defaultModelForEntity(entity_type: string): SupportedModel {
  switch (entity_type) {
    case "homepage_block":
    case "seo_meta":
    case "ad_copy":
      return "gpt-4o";
    default:
      // faq, service_block, testimonial, … all use mini
      return "gpt-4o-mini";
  }
}
