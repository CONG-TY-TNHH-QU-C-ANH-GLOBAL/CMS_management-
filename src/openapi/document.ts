// Canonical knowledge about the SHAPE of the generated OpenAPI document.
//
// The public-surface gate used to walk the document with `Object.keys(pathItem)` and
// `Number(status) < 400`. Both are wrong in ways that make the gate quietly weaker:
//
//   - An OpenAPI Path Item may legally hold `$ref`, `summary`, `description`, `servers` and
//     `parameters` alongside its operations. Treating every key as an HTTP method invents
//     operations, produces false method mismatches, and walks `responses` on objects that
//     have none.
//   - `Number("default")` and `Number("4XX")` are both NaN, and `NaN < 400` is false — so the
//     bounded-error-envelope check silently SKIPPED exactly the response keys whose semantics
//     are least clear. Passing was an accident of NaN, not a policy.
//
// These utilities exist so every traversal site shares one answer. They live in src/ rather
// than tests/ because they encode contract policy the document must satisfy, not test
// scaffolding.

/** HTTP methods this API serves. Derived from the route inventory, not from the OpenAPI spec's
 *  full method list — a `trace` or `head` operation appearing in our document would be a
 *  finding, not something to quietly accept. */
export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

const HTTP_METHOD_SET: ReadonlySet<string> = new Set(HTTP_METHODS);

/** Path Item keys that are metadata, not operations. Listed explicitly so an unexpected key is
 *  reported rather than silently ignored — see `pathItemMetadataKeys`. */
export const PATH_ITEM_METADATA_KEYS = [
  "$ref",
  "summary",
  "description",
  "servers",
  "parameters",
] as const;

const PATH_ITEM_METADATA_SET: ReadonlySet<string> = new Set(PATH_ITEM_METADATA_KEYS);

export interface OpenApiOperation {
  operationId?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

export type PathItem = Record<string, unknown>;

/**
 * The HTTP operations of a Path Item, and nothing else.
 *
 * This is THE way to iterate a path item. Path-level metadata is excluded by name rather than
 * by "does it look like an operation", so a future `servers` block cannot be mistaken for a
 * method and a future `head` operation cannot be silently skipped — it lands in
 * `unknownPathItemKeys` instead.
 */
export function openApiOperations(pathItem: PathItem): [HttpMethod, OpenApiOperation][] {
  return Object.entries(pathItem)
    .filter(([key]) => HTTP_METHOD_SET.has(key))
    .map(([key, value]) => [key as HttpMethod, value as OpenApiOperation]);
}

/** Path-level metadata keys present on this item. */
export function pathItemMetadataKeys(pathItem: PathItem): string[] {
  return Object.keys(pathItem).filter((key) => PATH_ITEM_METADATA_SET.has(key));
}

/** Keys that are neither a supported method nor known metadata. Any result here means the
 *  document grew a shape this gate does not understand, and the gate must fail rather than
 *  guess. */
export function unknownPathItemKeys(pathItem: PathItem): string[] {
  return Object.keys(pathItem).filter(
    (key) => !HTTP_METHOD_SET.has(key) && !PATH_ITEM_METADATA_SET.has(key),
  );
}

// ── Response status policy ──────────────────────────────────────────────────────────────────

export type ResponseStatusKind =
  | "informational"
  | "success"
  | "redirect"
  | "error"
  /** A key this public contract does not permit. `reason` says why. */
  | "unsupported";

export interface ResponseStatusClass {
  kind: ResponseStatusKind;
  reason?: string;
}

function isThreeDigit(key: string): boolean {
  if (key.length !== 3) return false;
  for (const ch of key) {
    if (ch < "0" || ch > "9") return false;
  }
  return true;
}

/**
 * Classify an OpenAPI response key under THIS project's declared policy.
 *
 * The policy, decided deliberately rather than inherited from `Number()` semantics:
 *
 *   - Exact numeric keys (`200`, `404`, …) are the only permitted form. 4xx and 5xx are
 *     errors and must carry the bounded `{ error }` envelope; 1xx/2xx/3xx are not errors.
 *   - Range keys (`2XX`, `4XX`, `5XX`) are PROHIBITED. The landing generates types from this
 *     document (scripts/generate-cms-types.ts); a range cannot be turned into a discriminated
 *     result type, so it would weaken the consumer contract rather than describe it. Every
 *     endpoint here already enumerates its statuses.
 *   - `default` is PROHIBITED. Its semantics are ambiguous by design — it may stand for a
 *     success or an error — so a public contract that permits it cannot state whether the
 *     bounded error envelope applies. Enumerate the statuses instead.
 *   - Anything else is malformed.
 *
 * `unsupported` is a FAILURE, not a skip. That is the whole point: the previous
 * `Number(status) < 400` treated every one of these as "not an error" and walked past it.
 */
export function classifyResponseStatus(key: string): ResponseStatusClass {
  if (isThreeDigit(key)) {
    switch (key[0]) {
      case "1":
        return { kind: "informational" };
      case "2":
        return { kind: "success" };
      case "3":
        return { kind: "redirect" };
      case "4":
      case "5":
        return { kind: "error" };
      default:
        return { kind: "unsupported", reason: `status class ${key[0]}xx is not an HTTP class` };
    }
  }

  if (key === "default") {
    return {
      kind: "unsupported",
      reason:
        "`default` is prohibited: its semantics are ambiguous (success or error), so the " +
        "bounded { error } envelope rule cannot be stated for it. Enumerate the statuses.",
    };
  }

  const upper = key.toUpperCase();
  if (upper.length === 3 && upper.endsWith("XX") && upper[0] >= "1" && upper[0] <= "5") {
    return {
      kind: "unsupported",
      reason:
        `range key "${key}" is prohibited: the landing generates types from this document and ` +
        "a range cannot become a discriminated result type. Enumerate the statuses.",
    };
  }

  return { kind: "unsupported", reason: `"${key}" is not a valid OpenAPI response key` };
}

/** Response keys that must carry the bounded `{ error }` envelope. */
export function isErrorStatus(key: string): boolean {
  return classifyResponseStatus(key).kind === "error";
}

// ── Parameter and locale policy ─────────────────────────────────────────────────────────────

/** The only locale set this platform serves. A `lang` parameter offering anything else is a
 *  contract break, not a per-endpoint choice. */
export const APPROVED_LOCALES = ["en", "vi", "zh"] as const;
const APPROVED_LOCALE_KEY = [...APPROVED_LOCALES].sort().join("|");

export interface OpenApiDocumentLike {
  paths?: Record<string, PathItem>;
  components?: { parameters?: Record<string, unknown> };
}

/**
 * Declaration forms this contract PROHIBITS.
 *
 * Policy decision, not an omission. The document is generated exclusively from `registerPath`
 * calls in src/openapi/paths.ts; nothing calls `registerComponent`, so it provably contains no
 * `components.parameters`, no `$ref` parameter and no path-level `parameters` block. Building
 * a reference resolver for forms the contract cannot produce would add machinery for a case
 * that does not exist — and, worse, would let the locale rule claim coverage it did not have.
 *
 * So those forms are rejected instead. If one ever appears, this fails and the policy gets
 * revisited deliberately rather than the locale check silently validating a subset.
 */
export function findParameterPolicyViolations(document: OpenApiDocumentLike): string[] {
  const violations: string[] = [];

  for (const name of Object.keys(document.components?.parameters ?? {})) {
    violations.push(`components.parameters.${name} — parameter components are prohibited`);
  }

  for (const [path, item] of Object.entries(document.paths ?? {})) {
    if ("parameters" in item) violations.push(`${path} — path-level parameters are prohibited`);
    if ("$ref" in item) violations.push(`${path} — path item $ref is prohibited`);
    for (const [method, operation] of openApiOperations(item)) {
      for (const parameter of operation.parameters ?? []) {
        if (parameter && typeof parameter === "object" && "$ref" in parameter) {
          violations.push(`${method.toUpperCase()} ${path} — $ref parameter is prohibited`);
        }
      }
    }
  }

  return violations;
}

/**
 * Every `lang` parameter whose enum is not exactly the approved locale set.
 *
 * Only operation-level inline parameters are inspected — which is COMPLETE coverage precisely
 * because `findParameterPolicyViolations` rejects every other declaration form. Run both; the
 * pair is what makes "every effective lang parameter is validated" a true statement.
 */
export function findLocaleEnumViolations(document: OpenApiDocumentLike): string[] {
  const offenders: string[] = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of openApiOperations(item)) {
      for (const parameter of operation.parameters ?? []) {
        const param = parameter as { name?: string; schema?: { enum?: unknown[] } };
        if (param.name !== "lang") continue;
        const values = [...(param.schema?.enum ?? [])].map(String).sort().join("|");
        if (values !== APPROVED_LOCALE_KEY) {
          offenders.push(`${method.toUpperCase()} ${path}: lang enum = [${values}]`);
        }
      }
    }
  }
  return offenders;
}
