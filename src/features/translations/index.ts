// Public API of the translations feature.
//
// Subfeatures:
//   • translations.transitions       — translation status state machine (impure)
//   • translations.transitions.pure  — pure validate + diffPatch (testable)
//   • glossary.service               — glossary CRUD service layer
//   • glossary.actions               — server functions for admin glossary UI

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
