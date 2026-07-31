// Code-owned KIND REGISTRY for service content. Each kind declares a locale-neutral core_config
// schema, a localized translated_payload schema, and its title/description rule. core_config and
// translated_payload are validated SEPARATELY (never merged with a generic object spread), and
// unknown kinds are rejected on write. Public reads may tolerate a legacy kind during migration
// via isKnownKind() — that lives in the mapper, not here.
import { z } from "zod";

import { ContentError } from "./content.errors";

/** A localized text rule over (title, description): returns an error message or null. */
type TextRule = (title: string | null, description: string | null) => string | null;

const nonEmpty = (s: string | null): boolean => s !== null && s.trim() !== "";
const titleRequired: TextRule = (t) => (nonEmpty(t) ? null : "title is required");
const bothRequired: TextRule = (t, d) =>
  nonEmpty(t) && nonEmpty(d) ? null : "title and description are required";
const eitherRequired: TextRule = (t, d) =>
  nonEmpty(t) || nonEmpty(d) ? null : "title or description is required";
const anyText: TextRule = () => null;

const EMPTY = z.object({}).strict();
const strArray = z.array(z.string());

export interface KindDef {
  /** Locale-neutral structured config living on the core block. */
  coreConfig: z.ZodType;
  /** Locale-dependent structured content living on each revision. */
  translatedPayload: z.ZodType;
  /** Title/description requirement for a revision of this kind. */
  text: TextRule;
  /** Coarse admin editor capabilities (drives which fields the CMS UI exposes). */
  editorCapabilities: readonly ("title" | "description" | "core_config" | "payload" | "media")[];
}

/** Every VERIFIED production kind (thg-order + thg-fulfill). Unknown kinds fail on write. */
export const KIND_REGISTRY = {
  pain_point: {
    coreConfig: EMPTY,
    translatedPayload: EMPTY,
    text: titleRequired,
    editorCapabilities: ["title", "description"],
  },
  process_step: {
    coreConfig: z.object({ num: z.number().int().positive() }).strict(),
    translatedPayload: EMPTY,
    text: bothRequired,
    editorCapabilities: ["title", "description", "core_config"],
  },
  solution: {
    coreConfig: EMPTY,
    translatedPayload: z.object({ tag: z.string() }).strict(),
    text: bothRequired,
    editorCapabilities: ["title", "description", "payload"],
  },
  shipping_lane: {
    coreConfig: EMPTY,
    translatedPayload: z
      .object({
        tag: z.string(),
        time: z.string(),
        features: strArray,
        note: z.string().optional(),
      })
      .strict(),
    text: titleRequired,
    editorCapabilities: ["title", "payload"],
  },
  policy: {
    coreConfig: EMPTY,
    translatedPayload: z.object({ tag: z.string(), items: strArray }).strict(),
    text: titleRequired,
    editorCapabilities: ["title", "payload"],
  },
  stat: {
    coreConfig: z.object({ val: z.string() }).strict(),
    translatedPayload: EMPTY,
    text: anyText,
    editorCapabilities: ["title", "core_config"],
  },
  journey_step: {
    coreConfig: EMPTY,
    translatedPayload: EMPTY,
    text: bothRequired,
    editorCapabilities: ["title", "description"],
  },
  capability: {
    coreConfig: EMPTY,
    translatedPayload: EMPTY,
    text: bothRequired,
    editorCapabilities: ["title", "description"],
  },
  section_copy: {
    coreConfig: EMPTY,
    translatedPayload: EMPTY,
    text: eitherRequired,
    editorCapabilities: ["title", "description"],
  },
  resource: {
    coreConfig: z.object({ href: z.string().url() }).strict(),
    translatedPayload: z.object({ label: z.string() }).strict(),
    text: titleRequired,
    editorCapabilities: ["title", "core_config", "payload"],
  },
} satisfies Record<string, KindDef>;

export type Kind = keyof typeof KIND_REGISTRY;

export function isKnownKind(kind: string): kind is Kind {
  return Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind);
}

function def(kind: string): KindDef {
  if (!isKnownKind(kind)) throw new ContentError("unknown_kind", `unknown block kind: ${kind}`);
  return KIND_REGISTRY[kind];
}

/** Validate a block's locale-neutral core_config for its kind (throws ContentError). */
export function validateCoreConfig(kind: string, coreConfig: unknown): void {
  const r = def(kind).coreConfig.safeParse(coreConfig);
  if (!r.success) throw new ContentError("invalid_core_config", `core_config invalid for ${kind}`);
}

/** Validate a revision's text rule + localized payload for the block's kind (throws ContentError). */
export function validateRevision(
  kind: string,
  input: { title: string | null; description: string | null; translatedPayload: unknown },
): void {
  const d = def(kind);
  const textErr = d.text(input.title, input.description);
  if (textErr) throw new ContentError("invalid_text", `${kind}: ${textErr}`);
  const r = d.translatedPayload.safeParse(input.translatedPayload);
  if (!r.success)
    throw new ContentError("invalid_payload", `translated_payload invalid for ${kind}`);
}

type JsonObj = Record<string, unknown>;

/** EXPLICIT per-kind public-compatibility mapper: builds the public DTO `payload` for a kind from its
 *  (core_config, translated_payload) — deliberately field-by-field, never a blind two-blob spread, so
 *  the current landing contract (Order reads num/tag/features…, Fulfill reads the injected key) holds. */
export const PUBLIC_PAYLOAD: Record<Kind, (core: JsonObj, translated: JsonObj) => JsonObj> = {
  pain_point: () => ({}),
  process_step: (core) => ({ num: core.num }),
  solution: (_core, t) => ({ tag: t.tag }),
  shipping_lane: (_core, t) => ({ tag: t.tag, time: t.time, features: t.features, note: t.note }),
  policy: (_core, t) => ({ tag: t.tag, items: t.items }),
  stat: (core) => ({ val: core.val }),
  journey_step: () => ({}),
  capability: () => ({}),
  section_copy: () => ({}),
  resource: (core, t) => ({ href: core.href, label: t.label }),
};
