import { expect, test } from "bun:test";

import {
  APPROVED_LOCALES,
  HTTP_METHODS,
  compareContractKeys,
  compareHttpMethods,
  isApprovedLocaleEnum,
  classifyResponseStatus,
  findLocaleEnumViolations,
  findParameterPolicyViolations,
  isErrorStatus,
  openApiOperations,
  pathItemMetadataKeys,
  unknownPathItemKeys,
} from "./document";

// Negative tests for the traversal and status utilities. These exist because the previous
// inline versions failed SILENTLY: path-level metadata was walked as if it were an operation,
// and `Number("default") < 400` is false, so the least-well-defined response keys were the
// ones the error-envelope rule skipped. Each case below is a shape that used to pass.

// ── Path Item traversal ─────────────────────────────────────────────────────────────────────

const operation = { responses: { "200": {} } };

test("path-level metadata is never returned as an operation", () => {
  const item = {
    $ref: "#/paths/~1other",
    summary: "a summary",
    description: "a description",
    servers: [{ url: "https://example.test" }],
    parameters: [{ name: "lang", in: "query" }],
    get: operation,
  };
  expect(openApiOperations(item).map(([method]) => method)).toEqual(["get"]);
});

test("a path item of pure metadata yields no operations at all", () => {
  // The old traversal would have produced five fake operations here, each then walked for
  // `responses` it does not have.
  const item = {
    $ref: "#/x",
    summary: "s",
    description: "d",
    servers: [],
    parameters: [],
  };
  expect(openApiOperations(item)).toEqual([]);
  expect(pathItemMetadataKeys(item)).toEqual([
    "$ref",
    "description",
    "parameters",
    "servers",
    "summary",
  ]);
});

test("every supported method is recognized, and only those", () => {
  const item = Object.fromEntries(HTTP_METHODS.map((m) => [m, operation]));
  // Canonical HTTP order, not alphabetical — `delete` does not come first.
  expect(openApiOperations(item).map(([m]) => m)).toEqual([...HTTP_METHODS]);
});

test("an unsupported method is reported, not silently skipped", () => {
  // `head`, `trace` and `options` are valid OpenAPI but are not part of this contract. They
  // must surface as unknown keys so the gate fails rather than quietly ignoring an operation.
  const item = { get: operation, head: operation, trace: operation, "x-internal": true };
  expect(openApiOperations(item).map(([m]) => m)).toEqual(["get"]);
  expect(unknownPathItemKeys(item)).toEqual(["head", "trace", "x-internal"]);
});

test("known metadata is not reported as unknown", () => {
  expect(unknownPathItemKeys({ summary: "s", get: operation })).toEqual([]);
});

test("traversal does not duplicate an operation", () => {
  const item = { get: operation, post: operation };
  const methods = openApiOperations(item).map(([m]) => m);
  expect(new Set(methods).size).toBe(methods.length);
});

// ── Response status policy ──────────────────────────────────────────────────────────────────

test("exact numeric statuses classify by HTTP class", () => {
  expect(classifyResponseStatus("100").kind).toBe("informational");
  expect(classifyResponseStatus("200").kind).toBe("success");
  expect(classifyResponseStatus("201").kind).toBe("success");
  expect(classifyResponseStatus("301").kind).toBe("redirect");
  expect(classifyResponseStatus("400").kind).toBe("error");
  expect(classifyResponseStatus("429").kind).toBe("error");
  expect(classifyResponseStatus("500").kind).toBe("error");
});

test("only 4xx and 5xx require the bounded error envelope", () => {
  expect(isErrorStatus("400")).toBe(true);
  expect(isErrorStatus("503")).toBe(true);
  expect(isErrorStatus("200")).toBe(false);
  expect(isErrorStatus("302")).toBe(false);
  expect(isErrorStatus("101")).toBe(false);
});

test("range keys are PROHIBITED — not silently treated as non-errors", () => {
  // `Number("4XX")` is NaN and `NaN < 400` is false, so the old check skipped these entirely.
  for (const key of ["1XX", "2XX", "3XX", "4XX", "5XX", "2xx", "4xx"]) {
    const classification = classifyResponseStatus(key);
    expect(classification.kind, key).toBe("unsupported");
    expect(classification.reason).toContain("range key");
  }
  expect(isErrorStatus("4XX")).toBe(false); // unsupported is not "error" — it is a failure
});

test("`default` is PROHIBITED and says why", () => {
  const classification = classifyResponseStatus("default");
  expect(classification.kind).toBe("unsupported");
  expect(classification.reason).toContain("ambiguous");
});

test("malformed keys are unsupported, not accidentally classified", () => {
  for (const key of ["", "20", "2000", "abc", "20x", "-01", " 200", "200 ", "٢٠٠"]) {
    expect(classifyResponseStatus(key).kind, JSON.stringify(key)).toBe("unsupported");
  }
});

test("a 6xx-style three-digit key is rejected rather than treated as an error", () => {
  // Three digits alone is not enough; the class must be a real HTTP class.
  const classification = classifyResponseStatus("600");
  expect(classification.kind).toBe("unsupported");
  expect(classification.reason).toContain("6xx");
});

// ── Parameter policy ────────────────────────────────────────────────────────────────────────

const langParam = (values: string[]) => ({ name: "lang", in: "query", schema: { enum: values } });
const okOperation = (values: string[] = ["en", "vi", "zh"]) => ({
  parameters: [langParam(values)],
  responses: { "200": {} },
});

test("an inline lang parameter with the approved enum passes", () => {
  const doc = { paths: { "/x": { get: okOperation() } } };
  expect(findParameterPolicyViolations(doc)).toEqual([]);
  expect(findLocaleEnumViolations(doc)).toEqual([]);
});

test("an inline lang parameter with a WRONG enum is reported", () => {
  for (const values of [["en"], ["en", "vi"], ["en", "vi", "zh", "ja"], []]) {
    const doc = { paths: { "/x": { get: okOperation(values) } } };
    expect(findLocaleEnumViolations(doc), JSON.stringify(values)).toHaveLength(1);
  }
});

test("a PATH-LEVEL parameter is rejected, not silently ignored", () => {
  // This is the form the old locale check could not see at all. It is now a policy violation.
  const doc = { paths: { "/x": { parameters: [langParam(["en"])], get: okOperation() } } };
  const violations = findParameterPolicyViolations(doc);
  expect(violations).toHaveLength(1);
  expect(violations[0]).toContain("path-level parameters are prohibited");
});

test("a $ref parameter is rejected", () => {
  const doc = {
    paths: { "/x": { get: { parameters: [{ $ref: "#/components/parameters/Lang" }] } } },
  };
  const violations = findParameterPolicyViolations(doc);
  expect(violations).toHaveLength(1);
  expect(violations[0]).toContain("$ref parameter is prohibited");
});

test("a components.parameters entry is rejected", () => {
  const doc = { paths: {}, components: { parameters: { Lang: langParam(["en"]) } } };
  const violations = findParameterPolicyViolations(doc);
  expect(violations).toHaveLength(1);
  expect(violations[0]).toContain("components.parameters.Lang");
});

test("a path item $ref is rejected", () => {
  const violations = findParameterPolicyViolations({ paths: { "/x": { $ref: "#/paths/~1y" } } });
  expect(violations).toHaveLength(1);
  expect(violations[0]).toContain("path item $ref is prohibited");
});

test("the locale check ignores non-lang parameters", () => {
  const doc = {
    paths: { "/x": { get: { parameters: [{ name: "scope", in: "query", schema: {} }] } } },
  };
  expect(findLocaleEnumViolations(doc)).toEqual([]);
});

test("path-level metadata cannot create a fake locale violation", () => {
  // `summary` and `servers` are not operations, so they carry no parameters to misread.
  const doc = {
    paths: { "/x": { summary: "s", servers: [{ url: "https://e.test" }], get: okOperation() } },
  };
  expect(findLocaleEnumViolations(doc)).toEqual([]);
});

// ── Deterministic ordering ──────────────────────────────────────────────────────────────────
// Every order-sensitive collection here has an explicit comparator chosen for its domain. The
// point is observable determinism: the same logical document must produce the same output
// whatever order it was assembled in, so diagnostics are diffable and comparisons are stable.

test("operations come back in canonical HTTP order, not insertion order", () => {
  const shuffled = { delete: operation, get: operation, patch: operation, post: operation };
  expect(openApiOperations(shuffled).map(([m]) => m)).toEqual(["get", "post", "patch", "delete"]);
});

test("HTTP methods are ordered semantically, which is NOT alphabetical", () => {
  expect(compareHttpMethods("get", "delete")).toBeLessThan(0);
  // Alphabetically "delete" < "get"; the canonical policy deliberately disagrees.
  expect("delete".localeCompare("get", "en-US")).toBeLessThan(0);
  expect(compareHttpMethods("post", "post")).toBe(0);
});

test("metadata and unknown keys are canonically ordered regardless of insertion order", () => {
  const a = { servers: [], $ref: "#/x", get: operation, "x-b": 1, "x-a": 1 };
  const b = { "x-a": 1, get: operation, $ref: "#/x", "x-b": 1, servers: [] };
  expect(pathItemMetadataKeys(a)).toEqual(pathItemMetadataKeys(b));
  expect(unknownPathItemKeys(a)).toEqual(unknownPathItemKeys(b));
  expect(unknownPathItemKeys(a)).toEqual(["x-a", "x-b"]);
});

test("the contract-key comparator is host-independent", () => {
  // A pinned locale, so CI and a developer machine agree. Bare localeCompare() would not
  // guarantee this.
  expect(compareContractKeys("/api/v1/blog", "/api/v1/careers")).toBeLessThan(0);
  expect(compareContractKeys("/a", "/a")).toBe(0);
  const keys = ["/z", "/a", "/m"];
  expect([...keys].sort(compareContractKeys)).toEqual(["/a", "/m", "/z"]);
});

test("violations are canonically ordered, so equivalent documents diff identically", () => {
  const bad = (path: string) => ({ [path]: { parameters: [], get: operation } });
  const forward = { paths: { ...bad("/a"), ...bad("/b"), ...bad("/c") } };
  const reversed = { paths: { ...bad("/c"), ...bad("/b"), ...bad("/a") } };
  expect(findParameterPolicyViolations(forward)).toEqual(findParameterPolicyViolations(reversed));
  expect(findParameterPolicyViolations(forward)[0]).toContain("/a");
});

test("locale violations are canonically ordered too", () => {
  const wrong = (path: string) => ({ [path]: { get: okOperation(["en"]) } });
  const forward = { paths: { ...wrong("/a"), ...wrong("/b") } };
  const reversed = { paths: { ...wrong("/b"), ...wrong("/a") } };
  expect(findLocaleEnumViolations(forward)).toEqual(findLocaleEnumViolations(reversed));
});

// ── Locale enum: a SET comparison, not a sort ───────────────────────────────────────────────

test("the approved enum matches in any declaration order", () => {
  // This is why sorting was the wrong tool: order is irrelevant to the contract.
  for (const order of [
    ["en", "vi", "zh"],
    ["zh", "vi", "en"],
    ["vi", "zh", "en"],
  ]) {
    expect(isApprovedLocaleEnum(order), order.join()).toBe(true);
  }
  expect(isApprovedLocaleEnum([...APPROVED_LOCALES])).toBe(true);
});

test("a DUPLICATE entry is rejected even though its set is correct", () => {
  // A pure set comparison would have accepted this; the length check is load-bearing.
  expect(isApprovedLocaleEnum(["en", "en", "vi", "zh"])).toBe(false);
  expect(isApprovedLocaleEnum(["en", "vi", "vi"])).toBe(false);
});

test("missing, extra and foreign locales are rejected", () => {
  expect(isApprovedLocaleEnum([])).toBe(false);
  expect(isApprovedLocaleEnum(["en", "vi"])).toBe(false);
  expect(isApprovedLocaleEnum(["en", "vi", "zh", "ja"])).toBe(false);
  expect(isApprovedLocaleEnum(["en", "vi", "ja"])).toBe(false);
});

test("a locale violation reports the values as DECLARED, not reordered", () => {
  const doc = { paths: { "/x": { get: okOperation(["zh", "en"]) } } };
  // The author wrote ["zh","en"]; showing them sorted would obscure what to fix.
  expect(findLocaleEnumViolations(doc)[0]).toContain("[zh|en]");
});
