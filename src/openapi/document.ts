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

/** Canonical order for HTTP methods: the order HTTP_METHODS declares, which reads
 *  read-then-write (get, post, put, patch, delete) rather than alphabetically (delete first).
 *  Methods are a closed semantic set, so lexical ordering would be arbitrary here. */
export function compareHttpMethods(a: HttpMethod, b: HttpMethod): number {
  return HTTP_METHODS.indexOf(a) - HTTP_METHODS.indexOf(b);
}

/** Canonical order for contract KEY STRINGS — path templates, path-item keys, field names.
 *
 *  A PINNED locale, deliberately. Bare `localeCompare()` uses the host's default collation, so
 *  the same document could order differently on a developer machine and in CI, making
 *  diagnostics and any snapshot environment-dependent. "en-US" matches the convention already
 *  established by `byMigrationFilename` in the PostgreSQL migration runner. */
export function compareContractKeys(a: string, b: string): number {
  return a.localeCompare(b, "en-US");
}

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
    .map(([key, value]) => [key as HttpMethod, value as OpenApiOperation] as const)
    .sort(([a], [b]) => compareHttpMethods(a, b))
    .map(([key, value]) => [key, value]);
}

/** Path-level metadata keys present on this item, in canonical key order so a diagnostic does
 *  not depend on the order the document happened to be built in. */
export function pathItemMetadataKeys(pathItem: PathItem): string[] {
  return Object.keys(pathItem)
    .filter((key) => PATH_ITEM_METADATA_SET.has(key))
    .sort(compareContractKeys);
}

/** Keys that are neither a supported method nor known metadata. Any result here means the
 *  document grew a shape this gate does not understand, and the gate must fail rather than
 *  guess. */
export function unknownPathItemKeys(pathItem: PathItem): string[] {
  return Object.keys(pathItem)
    .filter((key) => !HTTP_METHOD_SET.has(key) && !PATH_ITEM_METADATA_SET.has(key))
    .sort(compareContractKeys);
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
const APPROVED_LOCALE_SET: ReadonlySet<string> = new Set(APPROVED_LOCALES);

/**
 * Whether a declared enum is exactly the approved locale set.
 *
 * The previous implementation sorted both sides and compared the joined strings. That worked,
 * but sorting was only ever a PROXY for order-insensitive comparison — locale codes have no
 * meaningful alphabetical order, and Sonar was right that an implicit `.sort()` here has no
 * stated policy. Comparing as a set says what is actually meant, and removes the question.
 *
 * Duplicates still FAIL. `["en","en","vi","zh"]` is a malformed enum even though its set is
 * correct, so the length check is load-bearing, not defensive noise — a pure set comparison
 * would have silently accepted it.
 */
export function isApprovedLocaleEnum(values: readonly unknown[]): boolean {
  if (values.length !== APPROVED_LOCALES.length) return false;
  const declared = new Set(values.map(String));
  if (declared.size !== values.length) return false; // duplicate entries
  return [...declared].every((value) => APPROVED_LOCALE_SET.has(value));
}

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
  const violations = [
    ...componentParameterViolations(document),
    ...Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
      pathItemParameterViolations(path, item),
    ),
  ];
  // Canonical order so the same document always reports the same diagnostic, whatever order
  // its paths were registered in.
  return violations.sort(compareContractKeys);
}

/** Declaration site 1: reusable parameter components. */
function componentParameterViolations(document: OpenApiDocumentLike): string[] {
  return Object.keys(document.components?.parameters ?? {}).map(
    (name) => `components.parameters.${name} — parameter components are prohibited`,
  );
}

/** Declaration site 2: the path item itself — a shared `parameters` block or a `$ref` that
 *  would move the whole item somewhere this gate cannot see. */
function pathItemParameterViolations(path: string, item: PathItem): string[] {
  const violations: string[] = [];
  if ("parameters" in item) violations.push(`${path} — path-level parameters are prohibited`);
  if ("$ref" in item) violations.push(`${path} — path item $ref is prohibited`);
  for (const [method, operation] of openApiOperations(item)) {
    violations.push(...operationParameterViolations(path, method, operation));
  }
  return violations;
}

/** Declaration site 3: an operation's own parameter list. */
function operationParameterViolations(
  path: string,
  method: HttpMethod,
  operation: OpenApiOperation,
): string[] {
  return (operation.parameters ?? [])
    .filter(
      (parameter) => parameter !== null && typeof parameter === "object" && "$ref" in parameter,
    )
    .map(() => `${method.toUpperCase()} ${path} — $ref parameter is prohibited`);
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
        const declared = param.schema?.enum ?? [];
        if (!isApprovedLocaleEnum(declared)) {
          // Reported in DECLARATION order — that is what the author wrote and has to fix.
          offenders.push(`${method.toUpperCase()} ${path}: lang enum = [${declared.join("|")}]`);
        }
      }
    }
  }
  // Canonical order, same reasoning as findParameterPolicyViolations.
  return offenders.sort(compareContractKeys);
}
