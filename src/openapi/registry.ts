// OpenAPI registry — single module-scoped singleton that path registrations
// (added in D2.1+) attach themselves to. The `/api/v1/openapi.json` route
// generates the document from this registry's accumulated definitions.
//
// Design notes
//
// 1. `extendZodWithOpenApi(z)` is called exactly once at module load. It
//    monkey-patches every Zod schema with an `.openapi(...)` method so D2.1+
//    can tag schemas inline without per-call wrapping. The call is idempotent
//    in the sense that re-importing this module doesn't re-extend (the
//    library guards internally), but to be explicit we keep the call here.
//
// 2. The registry stays empty in D2.0. The `/api/v1/openapi.json` route
//    therefore returns a valid OpenAPI 3.1 document with `paths: {}`. That
//    is the intentional shape for this PR — D2.1+ adds path entries
//    incrementally so each route migration is independently verifiable.
//
// 3. Path registrations are CONSCIOUSLY kept out of the route handler files.
//    Each future batch adds entries to `src/openapi/paths.ts` (created in
//    D2.1), which references existing feature schemas via plain imports.
//    This isolation means the existing route handlers continue to return
//    byte-identical responses; the OpenAPI metadata lives elsewhere.
//
// 4. Module-load side-effect ordering: when `/api/v1/openapi.json` runs, it
//    imports `./generate`, which in D2.1+ will side-effect-import
//    `./paths`, which side-effect-imports every feature schema module that
//    registers a path. Module init runs once per isolate; subsequent
//    requests reuse the populated registry.

// ── Compatibility pin — DO NOT BUMP zod-to-openapi to 8.x ──────────────────
//
// @asteasolutions/zod-to-openapi is intentionally pinned to the 7.x line
// (exact `7.3.4` in package.json). This is the Zod 3-compatible release
// line. Version 8.x declares `peerDependencies: { zod: "^4.0.0" }` and uses
// Zod 4 internals (`$ZodRegistry`) at runtime — running 8.x against Zod 3
// produces:
//
//   TypeError: Cannot read properties of undefined (reading 'parent')
//       at $ZodRegistry.get
//
// The repository's validation baseline is Zod 3.x (~23 src/ files use it
// across features, actions, Copilot tools, translation pipeline). Migrating
// to Zod 4 is a foundational change far outside Phase D's scope. Until that
// migration is planned separately, keep this dep on the 7.x line.
//
// If a future "harmless dependency bump" PR tries to move this to 8.x,
// expect the GET /api/v1/openapi route to fail at runtime as soon as the
// registry contains any path with a Zod-typed parameter or schema body.
// ───────────────────────────────────────────────────────────────────────────

import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const openApiRegistry = new OpenAPIRegistry();
