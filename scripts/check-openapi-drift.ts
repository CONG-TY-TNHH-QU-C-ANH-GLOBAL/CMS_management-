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

import {
  blogListResponseSchema,
  blogPostResponseSchema,
} from "../src/features/blog/blog.schemas";
import {
  jobResponseSchema,
  jobsResponseSchema,
} from "../src/features/careers/careers.schemas";
import {
  contactLocationsResponseSchema,
  faqsResponseSchema,
  integrationsResponseSchema,
  marqueeImagesResponseSchema,
  servicesResponseSchema,
  testimonialsResponseSchema,
} from "../src/features/content/content.schemas";
import { homepageResponseSchema } from "../src/features/homepage/homepage.schemas";
import { translationsResponseSchema } from "../src/features/i18n/i18n.schemas";
import {
  policiesResponseSchema,
  policyResponseSchema,
} from "../src/features/policies/policies.schemas";
import {
  pricingResponseSchema,
  pricingTableResponseSchema,
} from "../src/features/pricing/pricing.schemas";
import { siteSettingsResponseSchema } from "../src/features/settings/settings.schemas";
import {
  blogListRouteConfig,
  blogPostRouteConfig,
  contactLocationsRouteConfig,
  faqsRouteConfig,
  homepageRouteConfig,
  integrationsRouteConfig,
  jobRouteConfig,
  jobsListRouteConfig,
  marqueeImagesRouteConfig,
  policiesListRouteConfig,
  policyRouteConfig,
  pricingListRouteConfig,
  pricingTableRouteConfig,
  servicesRouteConfig,
  siteSettingsRouteConfig,
  testimonialsRouteConfig,
  translationsRouteConfig,
} from "../src/openapi/paths";

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
  {
    name: "GET /api/v1/testimonials → 200",
    canonical: testimonialsResponseSchema,
    registered: testimonialsRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/contact-locations → 200",
    canonical: contactLocationsResponseSchema,
    registered: contactLocationsRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/integrations → 200",
    canonical: integrationsResponseSchema,
    registered: integrationsRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/translations → 200",
    canonical: translationsResponseSchema,
    registered: translationsRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/blog → 200",
    canonical: blogListResponseSchema,
    registered: blogListRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/blog/{slug} → 200",
    canonical: blogPostResponseSchema,
    registered: blogPostRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/marquee-images → 200",
    canonical: marqueeImagesResponseSchema,
    registered: marqueeImagesRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/jobs → 200",
    canonical: jobsResponseSchema,
    registered: jobsListRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/jobs/{slug} → 200",
    canonical: jobResponseSchema,
    registered: jobRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/services → 200",
    canonical: servicesResponseSchema,
    registered: servicesRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/homepage → 200",
    canonical: homepageResponseSchema,
    registered: homepageRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/site-settings → 200",
    canonical: siteSettingsResponseSchema,
    registered: siteSettingsRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/pricing → 200",
    canonical: pricingResponseSchema,
    registered: pricingListRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/pricing/{slug} → 200",
    canonical: pricingTableResponseSchema,
    registered: pricingTableRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/policies → 200",
    canonical: policiesResponseSchema,
    registered: policiesListRouteConfig.responses[200].content["application/json"].schema,
  },
  {
    name: "GET /api/v1/policies/{slug} → 200",
    canonical: policyResponseSchema,
    registered: policyRouteConfig.responses[200].content["application/json"].schema,
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
