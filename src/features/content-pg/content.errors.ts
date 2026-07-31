// Bounded service errors for the PostgreSQL content data plane. The Worker maps these to safe HTTP
// responses; they never carry a connection string, SQL text, or driver internals.
export type ContentErrorCode =
  | "unknown_kind"
  | "invalid_core_config"
  | "invalid_payload"
  | "invalid_text"
  | "duplicate_identity"
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

/** Postgres unique-violation SQLSTATE → our bounded duplicate error (identity is DB-enforced). */
export const PG_UNIQUE_VIOLATION = "23505";
