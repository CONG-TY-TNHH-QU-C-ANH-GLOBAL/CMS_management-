import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// @anthropic-ai/sdk keeps its Node built-ins in `<dir>/node.mjs` and declares
// `sideEffects: false`. Rollup merged that module into the shared getDb() chunk
// and dropped the `import * as stream/util` bindings while keeping the
// references, so every request on Workers threw "stream is not defined"
// (production outage on 2026-10-25, PR #103). The landing AI passes an explicit
// apiKey and uses fetch, so the SDK never touches those modules: resolve each
// one to the package's own `node.browser.mjs` (its `browser` field mapping).
function anthropicSdkWithoutNodeBuiltins(): Plugin {
  const NODE_SHIM = /[\\/]@anthropic-ai[\\/]sdk[\\/](?:.+[\\/])?node\.mjs$/;
  return {
    name: "anthropic-sdk-without-node-builtins",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !/[\\/]@anthropic-ai[\\/]sdk[\\/]/.test(importer)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved && NODE_SHIM.test(resolved.id)) {
        return { ...resolved, id: resolved.id.replace(/node\.mjs$/, "node.browser.mjs") };
      }
      return null;
    },
  };
}

// Plugin order matters: tanstackStart() must come before viteReact().
// cloudflare() runs in BOTH dev and build so server code that imports
// `cloudflare:workers` (D1/R2/KV bindings) works in dev as well as production.
// In dev, code executes inside workerd via the plugin, matching prod runtime.
export default defineConfig({
  plugins: [
    anthropicSdkWithoutNodeBuiltins(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          // Block server-only files from client bundle:
          //   - features/<name>/<name>.service.ts (DB queries, internal logic)
          //   - core/db/** (D1 bindings)
          //   - core/middlewares/** (CORS, rate-limit — server-only context)
          // Files importable from BOTH client and server:
          //   - features/<name>/<name>.actions.ts (createServerFn RPC stubs)
          //   - features/<name>/<name>.schema.ts (Zod schemas)
          //   - features/<name>/components/** (React UI)
          files: ["**/*.service.ts", "**/core/db/**", "**/core/middlewares/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: { host: "::", port: 8080 },
});
