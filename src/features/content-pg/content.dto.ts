// Compatibility mapper: normalized published rows → the EXISTING public service-block DTO consumed by
// legacy THG Order and Next THG Fulfill. Adds `block_key` as a first-class field (additive) while the
// `payload` is rebuilt per-kind by the registry's explicit mapper plus the injected `key` (Fulfill
// currently reads payload.key). The landing never sees the V2 database model.
import { PUBLIC_PAYLOAD, isKnownKind } from "./content.kinds";
import type { PublishedBlockRow } from "./content.repo";

export interface PublicServiceBlockDto {
  id: number;
  block_key: string;
  kind: string;
  position: number;
  icon: string | null;
  title: string | null;
  description: string | null;
  payload: Record<string, unknown>;
}

export function toPublicDto(row: PublishedBlockRow): PublicServiceBlockDto {
  const core = row.core_config ?? {};
  const translated = row.translated_payload ?? {};
  // Kind-specific public payload (explicit, field-by-field). Unknown kinds during migration fall back
  // to their raw translated payload rather than being dropped.
  const kindPayload = isKnownKind(row.kind)
    ? PUBLIC_PAYLOAD[row.kind](core, translated)
    : { ...translated };
  return {
    id: row.id,
    block_key: row.block_key,
    kind: row.kind,
    position: row.position,
    icon: row.icon,
    title: row.title,
    description: row.description,
    // `key` is injected explicitly (identity for the current Fulfill mapper), not a blind blob spread.
    payload: { ...kindPayload, key: row.block_key },
  };
}

export interface ServiceBlocksResponse {
  locale: string;
  page_slug: string;
  blocks: PublicServiceBlockDto[];
}

export function toResponse(
  pageSlug: string,
  locale: string,
  rows: PublishedBlockRow[],
): ServiceBlocksResponse {
  return { locale, page_slug: pageSlug, blocks: rows.map(toPublicDto) };
}
