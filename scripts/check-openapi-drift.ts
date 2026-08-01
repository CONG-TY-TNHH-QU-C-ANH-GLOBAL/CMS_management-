#!/usr/bin/env bun
// Anti-drift assertion (constraint #5 of the D2.1 brief) — CLI runner.
//
// The bindings AND the gate rules live in src/openapi/contract-bindings.ts; this file only
// runs them and maps the result to an exit code. That split is load-bearing: CI executes this
// script independently of `bun test`, so a rule living only in the test suite would not apply
// here. `checkContractBindings` is the single owner, which is why the empty-table rule cannot
// diverge between the two entry points — that divergence is exactly how a gate validating
// zero bindings could report success.
//
// Run locally:  bun run check:openapi-drift
// In CI:        same command — exits 1 on any failure, 0 on OK.
// Also asserted by `bun test` (src/openapi/public-surface.test.ts) through the same function.

import { CONTRACT_BINDINGS, checkContractBindings } from "../src/openapi/contract-bindings";

const failures = checkContractBindings();
const driftMessages = failures.filter((f) => f.kind === "schema-drift").map((f) => f.message);

for (const binding of CONTRACT_BINDINGS) {
  if (!driftMessages.some((message) => message.startsWith(binding.name))) {
    console.log(`✓ ${binding.name}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure.message}`);
  console.error(`\nFAIL: ${failures.length} contract binding check(s) failed.`);
  process.exit(1);
}

console.log(`\nOK — ${CONTRACT_BINDINGS.length} schema identity check(s) passed.`);
