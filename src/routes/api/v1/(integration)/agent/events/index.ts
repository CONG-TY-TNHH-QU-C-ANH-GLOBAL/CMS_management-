// POST /api/v1/agent/events — draft Event ingest for marketing.thgfulfill.com.
//
// The marketing tool's writer agent posts a finished Event here; the row lands
// as a DRAFT and appears in the CMS Event list for marketing to review, edit and
// publish. See src/features/events/events.ingest.ts for why a draft is the only
// outcome this route can produce.
//
// `(integration)` is a TanStack route GROUP — it shapes nothing in the URL, it
// marks the trust boundary, the way `(public)` and `(admin)` do. The path is
// /api/v1/agent/events, deliberately NOT under /api/v1/events/… : a static
// `ingest` segment there would shadow the `$slug` public detail route.
//
// No CORS headers by design. This is a backend-to-backend surface; a browser
// page must not be able to read the response even if it somehow held the token.

import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import "@/core/db/env";
import { checkServiceToken, serviceTokenRefusal } from "@/core/middlewares/service-token";
import { agentEventBodySchema } from "@/features/events/events.ingest.schema";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/v1/(integration)/agent/events/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkServiceToken(request, env.MARKETING_AGENT_TOKEN);
        if (auth !== "ok") return serviceTokenRefusal(auth);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Body phải là JSON hợp lệ." }, 400);
        }

        const parsed = agentEventBodySchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            {
              error: "Dữ liệu không hợp lệ.",
              // Field-level detail: the caller is a machine that has to fix its
              // own payload, and there is no user-facing surface to leak it to.
              issues: parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
            400,
          );
        }

        const { ingestAgentEvent } = await import("@/features/events/events.ingest");
        const { bumpCmsRev } = await import("@/core/db/mutations");
        try {
          const { event, outcome } = await ingestAgentEvent(parsed.data);
          // A draft changes nothing public, but the CMS admin reads through the
          // same rev — bump so the Event list shows the new draft immediately.
          await bumpCmsRev();
          return json(
            {
              ok: true,
              outcome,
              id: event.id,
              slug: event.slug,
              locale: event.locale,
              status: event.status,
              review_url: `${env.BASE_URL}/admin/content/events/${event.slug}`,
            },
            outcome === "created" ? 201 : 200,
          );
        } catch (err) {
          const statusCode =
            typeof err === "object" && err !== null && "statusCode" in err
              ? Number((err as { statusCode: unknown }).statusCode)
              : 500;
          if (statusCode === 409) {
            return json({ error: (err as Error).message }, 409);
          }
          console.error("[agent/events] ingest failed", err);
          return json({ error: "Không lưu được Event." }, 500);
        }
      },
    },
  },
});
