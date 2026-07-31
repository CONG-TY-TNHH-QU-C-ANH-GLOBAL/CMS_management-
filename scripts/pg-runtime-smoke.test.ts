import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";

// Fail-closed behaviour of the runtime smoke, proven WITHOUT a database (all refusals happen before any
// connection). Each case spawns the script with a clean env and asserts its exit code.
const script = fileURLToPath(new URL("./pg-runtime-smoke.ts", import.meta.url));

async function runSmoke(overrides: Record<string, string>): Promise<number> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env.SMOKE_DATABASE_URL;
  delete env.SMOKE_PREVIEW_HOSTS;
  Object.assign(env, overrides);
  const proc = Bun.spawn(["bun", script], { env, stdout: "ignore", stderr: "ignore" });
  return proc.exited;
}

test("smoke SKIPS (exit 0) with no SMOKE_DATABASE_URL (opt-in)", async () => {
  expect(await runSmoke({})).toBe(0);
});

test("smoke REFUSES (exit 2) when a URL is set but no preview allowlist is configured", async () => {
  expect(await runSmoke({ SMOKE_DATABASE_URL: "postgres://u:p@db.preview.example/x" })).toBe(2);
});

test("smoke REFUSES (exit 2) when the host is not on the preview allowlist", async () => {
  expect(
    await runSmoke({
      SMOKE_DATABASE_URL: "postgres://u:p@evil.example/x",
      SMOKE_PREVIEW_HOSTS: "db.preview.example",
    }),
  ).toBe(2);
});
