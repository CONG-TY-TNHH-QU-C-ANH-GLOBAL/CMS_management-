// Document builder. Reads from the `openApiRegistry` (populated incrementally
// by D2.1+ in `./paths`) and emits a self-contained OpenAPI 3.1 JSON
// document.
//
// D2.0: registry is empty → `paths: {}`. Frontend codegen (D3.2) will treat
// this as a no-op spec until D2.1+ ships endpoints.

import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

import { openApiRegistry } from "./registry";
// Side-effect import: ./paths registers every annotated route into the
// registry singleton at module load. Must be imported BEFORE the generator
// reads `openApiRegistry.definitions` below.
import "./paths";

// Spec locked at v1.0.0 in Phase D2.7 with 22 annotated endpoints. The
// contract-freeze wave adds the 11 public endpoints that shipped without a
// declaration — additive only, no response shape changed — so this is a
// MINOR bump to 1.1.0. Semver holds: backward-compatible additions bump the
// minor, breaking changes bump the major.
//
// The declared surface is no longer maintained by hand-counting: every route
// under src/routes/api/v1/(public)/ must appear here or be listed as an
// explicit non-JSON exclusion, and src/openapi/public-surface.test.ts fails
// the build otherwise.
const INFO = {
  title: "THG CMS API",
  version: "1.1.0",
  description:
    "Public API consumed by THG_landingpage. Covers content (FAQ, " +
    "testimonials, contact, integrations, marquee, services, " +
    "service-blocks, homepage, site-settings, sitemap), blog, careers, " +
    "pricing, policies, shipping routes, translations, community Q&A and " +
    "reviews, plus the write endpoints for leads, job applications and CV " +
    "upload. Frontend codegen at THG_landingpage uses /api/v1/openapi as " +
    "the source of truth (see scripts/generate-cms-types.ts); landing's Zod " +
    "runtime validation remains in place as defense-in-depth.",
} as const;

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: INFO,
  });
}
