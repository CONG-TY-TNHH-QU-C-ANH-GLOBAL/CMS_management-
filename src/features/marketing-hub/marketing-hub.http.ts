import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import "@/core/db/env";
import { getClientIp } from "@/core/middlewares/rate-limit";
import { digest, equal, hmac, readBounded } from "./marketing-hub.crypto";
import {
  ingestHubContent,
  ingestHubMedia,
  readHubContent,
  retryHubCallback,
  json,
  fail,
} from "./marketing-hub.service";

export async function handleHubRequest(
  request: Request,
  kind: "content" | "read" | "media" | "retry",
  externalId?: string,
): Promise<Response> {
  try {
    if (env.MARKETING_HUB_INGEST_ENABLED !== "true" || !env.MARKETING_HUB_SIGNING_SECRET)
      fail("MARKETING_HUB_DISABLED", 503);
    const limiter = env.RATE_LIMITER.get(
      env.RATE_LIMITER.idFromName(`marketing-hub:${getClientIp(request)}`),
    );
    const limit = await limiter.hit(kind === "media" ? 20 : 120, 60);
    if (!limit.allowed)
      return new Response(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED" } }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": "60",
        },
      });
    const eventId = request.headers.get("x-thg-event-id") || "";
    const timestamp = request.headers.get("x-thg-timestamp") || "";
    const signature = request.headers.get("x-thg-signature") || "";
    if (
      request.headers.get("x-thg-contract") !== "marketing-hub-content.v1" ||
      !/^[A-Za-z0-9:._-]{1,120}$/.test(eventId) ||
      !/^v1=[a-f0-9]{64}$/.test(signature) ||
      !Number.isFinite(Date.parse(timestamp)) ||
      Math.abs(Date.now() - Date.parse(timestamp)) > 300000
    )
      fail("INVALID_SIGNATURE", 401);
    const raw = await readBounded(request, kind === "media" ? 1500000 : 262144);
    const expected = await hmac(
      env.MARKETING_HUB_SIGNING_SECRET,
      `${timestamp}\n${eventId}\n${raw}`,
    );
    if (!equal(signature.slice(3), expected)) fail("INVALID_SIGNATURE", 401);
    const requestHash = await digest(`${request.method}\n${new URL(request.url).pathname}\n${raw}`);
    if (kind === "read") {
      if (!externalId || externalId.length > 300) fail("INVALID_EXTERNAL_ID", 422);
      return await readHubContent(externalId);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      fail("JSON_REQUIRED", 415);
    if (kind === "retry") {
      if (!externalId || !/^[a-f0-9]{32}$/.test(externalId)) fail("INVALID_EVENT_ID", 422);
      return await retryHubCallback(externalId, raw, eventId, requestHash);
    }
    return kind === "media"
      ? await ingestHubMedia(raw, eventId, requestHash)
      : await ingestHubContent(raw, eventId, requestHash);
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            details: error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        422,
      );
    if (error instanceof SyntaxError)
      return json({ ok: false, error: { code: "INVALID_JSON" } }, 400);
    const status =
      typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "MARKETING_HUB_FAILURE";
    return json({ ok: false, error: { code } }, status >= 400 && status <= 599 ? status : 500);
  }
}
