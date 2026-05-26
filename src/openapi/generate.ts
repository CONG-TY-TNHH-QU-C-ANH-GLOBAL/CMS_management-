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

// Adjust `info.version` only via Phase D2.7 (per playbook). 0.1.0-draft is
// the deliberate signal that this spec is in active migration.
const INFO = {
  title: "THG CMS API",
  version: "0.1.0-draft",
  description:
    "Public read-only API consumed by THG_landingpage. Spec is in active " +
    "migration (Phase D2). Endpoint coverage grows per D2.x. Frontend " +
    "codegen treats missing paths as 'not yet annotated' — Zod runtime " +
    "validation on landing remains the source of truth until D2.7 locks v1.",
} as const;

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: INFO,
  });
}
