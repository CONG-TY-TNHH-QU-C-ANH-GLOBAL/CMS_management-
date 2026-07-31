// Bounded service errors for the PostgreSQL content data plane. The Worker maps these to safe HTTP
// responses; they never carry a connection string, SQL text, or driver internals.
export type ContentErrorCode =
  | "unknown_kind"
  | "invalid_core_config"
  | "invalid_payload"
  | "invalid_text"
  | "duplicate_identity"
  | "not_publishable"
  | "not_found"
  | "conflict"
  | "db_unavailable";

export class ContentError extends Error {
  constructor(
    readonly code: ContentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ContentError";
  }
}

/** SQLSTATEs the repository maps by CODE (never by message text). */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_SERIALIZATION_FAILURE = "40001";
/** Custom application SQLSTATE raised by the content.* DB functions for "not eligible for this
 *  operation" (missing/non-draft/non-reviewed/cross-localization). Class 'PT' is user-defined. */
export const PG_CONTENT_NOT_ELIGIBLE = "PT001";
