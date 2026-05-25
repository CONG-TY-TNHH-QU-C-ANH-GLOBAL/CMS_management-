import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Vitest configuration is intentionally minimal in D4.1.
//
// Tests in this PR are pure-utility — they do NOT spin up Cloudflare workerd,
// do NOT use Miniflare, and do NOT instantiate D1. That's deliberate to keep
// blast radius zero. The decision about how D4.2+ touches the worker runtime
// is open (see PR description); two paths are on the table:
//
//   (a) service-layer tests that import feature services directly and pass
//       a mocked D1 binding — no `@cloudflare/vitest-pool-workers` needed;
//   (b) full HTTP tests with `@cloudflare/vitest-pool-workers` — heavier
//       setup, runs tests inside actual workerd.
//
// Picking between (a) and (b) is NOT D4.1's job. This config stays Node-env.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(here, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // No globals; explicit imports of vi/expect/describe/it keep call sites
    // greppable and avoid leaking vitest types into production code.
    globals: false,
  },
});
