#!/usr/bin/env bun
// Anti-drift assertion (constraint #5 of the D2.1 brief) — CLI runner.
//
// The bindings and the identity rule live in src/openapi/contract-bindings.ts; this file only
// runs them and maps the result to an exit code. They were split because keeping the table
// here meant re-importing the ~40 canonical schemas and route configs that src/openapi/paths.ts
// already imports, and two files listing the same wiring is duplication Sonar correctly
// counted. The assertion itself is unchanged: a registered schema must be the SAME OBJECT
// (`===`) as the canonical feature export — the failure mode being someone redefining a
// similar-looking Zod shape in paths.ts instead of importing it.
//
// Run locally:  bun run check:openapi-drift
// In CI:        same command — exits 1 on drift, 0 on OK.
// Also asserted by `bun test` (src/openapi/public-surface.test.ts), so drift fails the test
// suite even if this script is not run.

import { CONTRACT_BINDINGS, findContractDrift } from "../src/openapi/contract-bindings";

const failures = findContractDrift();
const failed = new Set(failures.map((f) => f.name));

for (const binding of CONTRACT_BINDINGS) {
  if (!failed.has(binding.name)) console.log(`✓ ${binding.name}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      `✗ ${failure.name}: OpenAPI registration is NOT the canonical schema. ` +
        `Someone likely redefined a similar Zod shape in src/openapi/paths.ts ` +
        `instead of importing from features/<feature>/<feature>.schemas. ` +
        `Fix: replace the inline schema with the canonical import.`,
    );
  }
  console.error(
    `\nFAIL: ${failures.length}/${CONTRACT_BINDINGS.length} schema identity check(s) failed.`,
  );
  process.exit(1);
}

console.log(`\nOK — ${CONTRACT_BINDINGS.length} schema identity check(s) passed.`);
