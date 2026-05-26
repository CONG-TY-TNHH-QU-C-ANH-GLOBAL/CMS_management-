#!/usr/bin/env bun
// Anti-drift assertion (constraint #5 of D2.1 brief).
//
// For each entry in CHECKS, verifies that the schema reference embedded in
// the OpenAPI route config is THE SAME OBJECT (`===`) as the canonical
// schema exported from features/<feature>/<feature>.schemas. This catches
// the failure mode where someone re-defines a similar-looking Zod schema
// in src/openapi/paths.ts instead of importing the feature schema. That
// drift would silently desync the OpenAPI document from the actual runtime
// shape (the incident-class problem that motivated Phase D).
//
// Run locally:  bun run check:openapi-drift
// In CI:        same command — exits 1 on drift, 0 on OK.
//
// As D2.x rolls out, add one CHECKS entry per migrated endpoint. Keep it a
// flat list — no abstractions until a real second axis of variation
// appears (D2.1 brief constraint #6: no premature abstraction).

import { faqsResponseSchema } from "../src/features/content/content.schemas";
import { faqsRouteConfig } from "../src/openapi/paths";

interface Check {
  name: string;
  canonical: unknown;
  registered: unknown;
}

const CHECKS: Check[] = [
  {
    name: "GET /api/v1/faqs → 200",
    canonical: faqsResponseSchema,
    registered: faqsRouteConfig.responses[200].content["application/json"].schema,
  },
];

let failed = 0;
for (const c of CHECKS) {
  if (c.canonical === c.registered) {
    console.log(`✓ ${c.name}`);
  } else {
    console.error(
      `✗ ${c.name}: OpenAPI registration is NOT the canonical schema. ` +
        `Someone likely redefined a similar Zod shape in src/openapi/paths.ts ` +
        `instead of importing from features/<feature>/<feature>.schemas. ` +
        `Fix: replace the inline schema with the canonical import.`,
    );
    failed++;
  }
}

if (failed > 0) {
  console.error(`\nFAIL: ${failed}/${CHECKS.length} schema identity check(s) failed.`);
  process.exit(1);
}

console.log(`\nOK — ${CHECKS.length} schema identity check(s) passed.`);
