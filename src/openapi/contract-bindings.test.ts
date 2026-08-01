import { expect, test } from "bun:test";
import { z } from "zod";

import {
  ContractBindingError,
  bindResponse,
  checkContractBindings,
  type ContractBinding,
} from "./contract-bindings";

// The gate must fail for the right reasons. Two failure modes are covered here that the
// previous implementation got wrong:
//
//   1. An empty binding table reported SUCCESS. `bun run check:openapi-drift` runs
//      independently of `bun test`, so the non-empty assertion that lived only in the test
//      suite did not apply to the script. `checkContractBindings` now owns both rules, and
//      both entry points call it.
//   2. A binding naming an unregistered status crashed at module init with a bare
//      `TypeError: Cannot read properties of undefined` and no indication of which binding.
//      That path is now a typed error with method/path/status — exercised in the
//      "diagnostic" tests below through the same guard the real bindings use.

const schema = z.object({ ok: z.boolean() });

const passing: ContractBinding = { name: "GET /x → 200", canonical: schema, registered: schema };
const drifting: ContractBinding = {
  name: "GET /y → 200",
  canonical: schema,
  registered: z.object({ ok: z.boolean() }), // structurally identical, DIFFERENT object
};

test("an empty binding table FAILS CLOSED", () => {
  // A contract gate that validates zero bindings and reports success makes a green CI check
  // mean nothing. This is the single most important assertion in the file.
  const failures = checkContractBindings([]);
  expect(failures).toHaveLength(1);
  expect(failures[0].kind).toBe("empty-binding-set");
  expect(failures[0].message).toContain("fail closed");
});

test("a matching binding passes", () => {
  expect(checkContractBindings([passing])).toEqual([]);
});

test("a structurally identical but distinct schema is DRIFT", () => {
  // Identity, not deep equality — that is the whole point of the check. A lookalike Zod object
  // redefined in paths.ts must fail.
  const failures = checkContractBindings([drifting]);
  expect(failures).toHaveLength(1);
  expect(failures[0].kind).toBe("schema-drift");
  expect(failures[0].message).toContain("GET /y → 200");
});

test("drift is reported per binding, and passing ones are not", () => {
  const failures = checkContractBindings([passing, drifting]);
  expect(failures.map((f) => f.kind)).toEqual(["schema-drift"]);
  expect(failures[0].message.startsWith("GET /y → 200")).toBe(true);
});

test("the real binding table is non-empty and clean", () => {
  expect(checkContractBindings()).toEqual([]);
});

// ── Binding lookup diagnostics ──────────────────────────────────────────────────────────────

const jsonResponse = { content: { "application/json": { schema } } };

test("a valid binding reads the schema OUT of the config, preserving identity", () => {
  const config = {
    path: "/api/v1/x",
    method: "get",
    responses: { 200: jsonResponse },
  } as const;
  const binding = bindResponse(config, 200, schema);
  // Same object, not a copy — identity is what the drift check compares.
  expect(binding.registered).toBe(schema);
  expect(binding.name).toBe("GET /api/v1/x → 200");
});

test("a MISSING response status throws with method, path and status", () => {
  // Previously this was `TypeError: Cannot read properties of undefined` at module init, with
  // no indication of which binding was wrong.
  const config = { path: "/api/v1/x", method: "post", responses: { 200: jsonResponse } };
  let thrown: unknown;
  try {
    // Cast: the generic makes this a compile error for an `as const` config, which is the
    // first line of defence. This exercises the runtime guard behind it.
    bindResponse(config as never, 404 as never, schema);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ContractBindingError);
  const message = (thrown as Error).message;
  expect(message).toContain("POST");
  expect(message).toContain("/api/v1/x");
  expect(message).toContain("404");
  expect(message).toContain("no such response status");
});

test("a response with NO application/json schema throws with the same diagnostics", () => {
  const config = {
    path: "/api/v1/media/{splat}",
    method: "get",
    responses: { 200: { content: { "image/png": {} } } },
  };
  let thrown: unknown;
  try {
    bindResponse(config as never, 200 as never, schema);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ContractBindingError);
  const message = (thrown as Error).message;
  expect(message).toContain("GET");
  expect(message).toContain("/api/v1/media/{splat}");
  expect(message).toContain("200");
  expect(message).toContain("no application/json schema");
});

test("a response present but with an undefined schema is caught, not bound as undefined", () => {
  // The nastiest case: binding `undefined` would make `canonical !== registered` and surface
  // as fake drift, or `undefined === undefined` and pass vacuously.
  const config = {
    path: "/api/v1/x",
    method: "get",
    responses: { 200: { content: { "application/json": {} } } },
  };
  expect(() => bindResponse(config as never, 200 as never, schema)).toThrow(ContractBindingError);
});
