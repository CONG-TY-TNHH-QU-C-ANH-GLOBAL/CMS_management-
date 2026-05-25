// Serves the live OpenAPI 3.1 document built from the registry singleton.
//
// URL: `${BASE_URL}/api/v1/openapi`
// Content-Type: application/json
//
// (File-based routing in TanStack Router treats dots as path separators, so
// `openapi.json.ts` would resolve to `/api/v1/openapi/json`. Using
// `openapi/index.ts` gives the cleaner `/api/v1/openapi` URL. Frontend
// codegen sets Accept: application/json and parses the body — the URL
// extension is irrelevant. If we ever need an `.json` suffix for tooling
// that sniffs URLs, add a second route file that re-exports this handler.)
//
// D2.0 scope: registry is empty → response has `paths: {}`. Existing API
// endpoints are NOT touched; this route is additive. D2.1+ batches register
// individual paths into the same registry.

import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { generateOpenApiDocument } from "@/openapi/generate";

export const Route = createFileRoute("/api/v1/(public)/openapi/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: ({ request }) => corsJson(request, generateOpenApiDocument()),
    },
  },
});
