// Public API of the translations feature.
//
// Subfeatures:
//   • translations.transitions        — translation status state machine (impure)
//   • translations.transitions.pure   — pure validate + diffPatch (testable)
//   • glossary.service                — glossary CRUD service layer
//   • glossary.actions                — server functions for admin glossary UI
//   • translations.hash               — normalized source hashing
//   • translations.pricing            — model pricing + cost computation
//   • translations.prompt             — prompt builder (PURE)
//   • translations.structural         — JSON parse recovery + structural validation
//   • translations.openai             — OpenAI wrapper with malformed-JSON recovery
//   • translations.log.service        — ai_translation_log insert + read
//   • translations.service            — main /translate orchestrator
//   • faq.translation.service         — FAQ-specific lifecycle (approve, edit, stale, source_changed)

export * from "./translations.transitions";
export {
  GLOSSARY_CATEGORIES,
  createGlossaryTerm,
  deleteGlossaryTerm,
  findGlossaryDuplicates,
  listGlossary,
  listGlossaryForPrompt,
  updateGlossaryTerm,
} from "./glossary.service";
export type { GlossaryCategory, GlossaryDuplicateWarning, GlossaryRow } from "./glossary.service";

export { computeSourceHash, normalizeForHash } from "./translations.hash";
export {
  MODEL_PRICING,
  computeCostUsd,
  defaultModelForEntity,
  type SupportedModel,
} from "./translations.pricing";
export {
  approveFaqTranslation,
  deleteFaqTranslation,
  editFaqTranslation,
  listAllFaqTranslations,
  listFaqTranslationsForId,
  markFaqTranslationStale,
  onFaqSourceChanged,
  type FaqTranslationRow,
} from "./faq.translation.service";
export {
  insertAiTranslationLog,
  listAiTranslationLogsForEntity,
  summarizeAiTranslationLog,
  type AiTranslationLogRow,
  type AiTranslationLogStatus,
  type AiTranslationLogSummary,
} from "./translations.log.service";
export {
  OpenAiKeyMissingError,
  TranslationInFlightError,
  TranslationSourceNotFoundError,
  translate,
  type TargetLocale,
  type TranslateEntityType,
  type TranslateInput,
  type TranslateOutput,
} from "./translations.service";
