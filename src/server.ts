import "./core/utils/error-capture";

import { consumeLastCapturedError } from "./core/utils/error-capture";
import { renderErrorPage } from "./core/utils/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },

  // Cron Trigger (every minute — see wrangler.jsonc `triggers.crons`). Resume
  // safety net for the async translation queue: claims any pending / lease-
  // expired chunks and drives them to completion. Jobs created via the admin
  // also kick an inline pass, so this is purely the durability backstop for
  // crashed/timed-out passes. waitUntil keeps the worker alive for the async
  // work after the scheduled callback returns.
  async scheduled(
    _controller: unknown,
    env: { OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string },
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const { runTranslationJobs } = await import(
      "./features/translations/translation-jobs.engine"
    );
    // C3: flush a pending landing rebuild (coalesced dirty flag → one
    // repository_dispatch). Independent of translation work.
    const { flushLandingRebuild } = await import("./features/careers/landing-rebuild");
    ctx.waitUntil(
      Promise.allSettled([
        runTranslationJobs(env, 60_000),
        flushLandingRebuild(),
      ]).then((results) => {
        for (const r of results) {
          if (r.status === "rejected") console.error("[scheduled] task failed", r.reason);
        }
      }),
    );
  },
};
