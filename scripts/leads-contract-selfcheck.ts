#!/usr/bin/env bun
// Multi-intent lead contract self-check (WEB-002 land-and-expand). The CMS repo has no test
// runner; this framework-free assertion script mirrors `bun run scripts/check-openapi-drift.ts`
// and covers the lead-request contract + notification branch WITHOUT a database. DB persistence +
// the migration are validated via `wrangler d1 migrations apply --local` and the running-worker E2E.
//
// Run locally:  bun run check:leads-contract   (exits 1 on failure, 0 on OK)
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseLeadRequest, SERVICE_KEYS, SURFACE_KEYS } from "../src/features/leads/lead-request";
import { formatLead } from "../src/features/telegram/telegram.formatters";

const base = { name: "Jane", email: "Jane@Example.com", turnstile_token: "tok" };

function ok(body: unknown) {
  const r = parseLeadRequest(body);
  assert.equal(r.ok, true, `expected accept, got: ${r.ok ? "" : r.message}`);
  return r.ok ? r.value : (undefined as never);
}
function rejected(body: unknown, why: string) {
  const r = parseLeadRequest(body);
  assert.equal(r.ok, false, `expected reject (${why}) but it was accepted`);
}

// 1. Generic lead, no service intent → accepted, unclassified (never defaulted).
{
  const v = ok({ ...base });
  assert.equal(v.primary_service, null);
  assert.deepEqual(v.service_interests, []);
  assert.equal(v.service_details, null);
  assert.equal(v.surface, null);
}

// 2. Generic attributed lead — surface WITHOUT service intent is allowed.
{
  const v = ok({ ...base, surface: "home-conversion-inline" });
  assert.equal(v.surface, "home-conversion-inline");
  assert.equal(v.primary_service, null);
  assert.deepEqual(v.service_interests, []);
}

// 3. One selected service.
{
  const v = ok({
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill"],
    surface: "fulfill-inline",
  });
  assert.equal(v.primary_service, "fulfill");
  assert.deepEqual(v.service_interests, ["fulfill"]);
}

// 4. Multiple interests (land-and-expand): primary + secondary.
{
  const v = ok({
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill", "warehouse"],
    surface: "fulfill-inline",
  });
  assert.deepEqual(v.service_interests, ["fulfill", "warehouse"]);
  // Secondary with no details carries none.
  assert.equal(v.service_details, null);
}

// 4b. Interest order is deterministic — primary first, then canonical registry order — regardless
// of the order the client submitted them in.
{
  const v = ok({
    ...base,
    primary_service: "warehouse",
    service_interests: ["dropship", "fulfill", "warehouse"],
    surface: "global-services-dialog",
  });
  assert.deepEqual(v.service_interests, ["warehouse", "fulfill", "dropship"]);
}
{
  // No primary → canonical registry order (fulfill, express, warehouse, dropship).
  const v = ok({
    ...base,
    service_interests: ["dropship", "express"],
    surface: "global-services-dialog",
  });
  assert.deepEqual(v.service_interests, ["express", "dropship"]);
}

// 5. Primary must be included in interests.
rejected(
  {
    ...base,
    primary_service: "fulfill",
    service_interests: ["warehouse"],
    surface: "fulfill-inline",
  },
  "primary not in interests",
);

// 6. Duplicate interests rejected.
rejected(
  {
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill", "fulfill"],
    surface: "fulfill-inline",
  },
  "duplicate interests",
);

// 7. Unknown interest rejected.
rejected(
  { ...base, service_interests: ["spaceship"], surface: "fulfill-inline" },
  "unknown interest",
);

// 8. Details validated by the matching schema + kept.
{
  const v = ok({
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill", "warehouse"],
    service_details: { fulfill: { product_type: "apparel" } },
    surface: "fulfill-inline",
  });
  assert.deepEqual(v.service_details, { fulfill: { product_type: "apparel" } });
}

// 9. Details for a service NOT in interests rejected.
rejected(
  {
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill"],
    service_details: { warehouse: {} },
    surface: "fulfill-inline",
  },
  "details for unselected service",
);

// 10. Unknown detail key rejected (.strict()).
rejected(
  {
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill"],
    service_details: { fulfill: { product_type: "apparel", foo: 1 } },
    surface: "fulfill-inline",
  },
  "unknown detail key",
);

// 11. Invalid detail value rejected.
rejected(
  {
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill"],
    service_details: { fulfill: { product_type: "spaceship" } },
    surface: "fulfill-inline",
  },
  "invalid product_type",
);

// 12. Empty per-service details are dropped (secondary interest with {} carries no details).
{
  const v = ok({
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill"],
    service_details: { fulfill: {} },
    surface: "fulfill-inline",
  });
  assert.equal(v.service_details, null);
}

// 13. Turnstile + common fields remain mandatory.
rejected({ name: "Jane", email: "jane@example.com" }, "missing turnstile_token");
rejected({ email: "jane@example.com", turnstile_token: "tok" }, "missing name");
rejected({ ...base, email: "not-an-email" }, "invalid email");

// 14. service intent, surface, source_page and utm remain SEPARATE dimensions.
{
  const v = ok({
    ...base,
    primary_service: "fulfill",
    service_interests: ["fulfill"],
    surface: "global-services-dialog",
    source_page: "/en/thg-fulfill",
    utm: { utm_source: "google" },
  });
  assert.equal(v.surface, "global-services-dialog");
  assert.equal(v.source_page, "/en/thg-fulfill");
  assert.deepEqual(v.utm, { utm_source: "google" });
}

// 15. Notification shows the primary AND adjacent interests; legacy shows neither.
{
  const withIntent = formatLead({
    id: 7,
    name: "Jane",
    email: "j@e.com",
    phone: null,
    message: null,
    source_page: null,
    locale: null,
    primary_service: "fulfill",
    service_interests: ["fulfill", "warehouse"],
  });
  assert.ok(withIntent.includes("fulfill"), "notification shows primary");
  assert.ok(withIntent.includes("warehouse"), "notification shows adjacent interest");
  const legacy = formatLead({
    id: 8,
    name: "Jane",
    email: "j@e.com",
    phone: null,
    message: null,
    source_page: null,
    locale: null,
    primary_service: null,
    service_interests: [],
  });
  assert.ok(
    !/·\s*<b>/.test(legacy) && !legacy.includes("➕"),
    "legacy notification shows no intent",
  );
}

// 16. PII-safe: the contract module performs no logging of its own.
{
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../src/features/leads/lead-request.ts"),
    "utf8",
  );
  assert.ok(!/console\./.test(src), "lead-request.ts must not log");
}

assert.ok(SURFACE_KEYS.length >= 5);
console.log(
  `✓ leads-contract self-check passed (${SERVICE_KEYS.length} services, ${SURFACE_KEYS.length} surfaces, multi-intent)`,
);
