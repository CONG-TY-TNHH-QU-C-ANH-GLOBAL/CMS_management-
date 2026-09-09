// Dependency-light local OpenAPI server for cross-repository contract generation.
// It intentionally avoids booting Miniflare/D1 because this document is pure code.
import { generateOpenApiDocument } from "../src/openapi/generate";

const port = Number(process.env.OPENAPI_LOCAL_PORT ?? 8091);
Bun.serve({
  port,
  fetch: () => Response.json(generateOpenApiDocument()),
});
console.log(`OpenAPI document ready at http://127.0.0.1:${port}`);
