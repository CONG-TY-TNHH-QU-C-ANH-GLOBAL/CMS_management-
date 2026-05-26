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

// Spec locked at v1.0.0 in Phase D2.7. All 15 public CMS endpoints are
// now annotated. Future changes follow semver: backward-compatible
// additions bump the minor, breaking changes bump the major.
const INFO = {
  title: "THG CMS API",
  version: "1.0.0",
  description:
    "Public read-only API consumed by THG_landingpage. Spec covers 15 " +
    "annotated endpoints across content (FAQ, testimonials, contact, " +
    "integrations, marquee, services, homepage, site-settings), blog, " +
    "careers, pricing, policies, and translations. Frontend codegen at " +
    "THG_landingpage uses /api/v1/openapi as the source of truth (see " +
    "scripts/generate-cms-types.ts); landing's Zod runtime validation " +
    "remains in place as defense-in-depth.",
} as const;

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: INFO,
  });
}
