import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Plugin order matters: tanstackStart() must come before viteReact().
// cloudflare() runs in BOTH dev and build so server code that imports
// `cloudflare:workers` (D1/R2/KV bindings) works in dev as well as production.
// In dev, code executes inside workerd via the plugin, matching prod runtime.
export default defineConfig({
  plugins: [
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
